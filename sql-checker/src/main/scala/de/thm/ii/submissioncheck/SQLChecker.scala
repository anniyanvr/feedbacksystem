package de.thm.ii.submissioncheck

import akka.Done
import akka.actor.ActorSystem
import akka.kafka.{ConsumerSettings, ProducerSettings, Subscriptions}
import akka.stream.{ActorMaterializer, Materializer}
import akka.stream.scaladsl.{Keep, Sink, Source}
import akka.kafka.scaladsl.{Consumer, Producer}
import akka.kafka.scaladsl.Consumer.DrainingControl
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.common.serialization.{StringDeserializer, StringSerializer}

import scala.io.Source
import scala.concurrent.{ExecutionContextExecutor, Future}
import scala.util.{Failure, Success}
import java.io._
import java.util.NoSuchElementException
import java.net.{HttpURLConnection, URL, URLDecoder}
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths, StandardCopyOption}
import java.security.cert.X509Certificate
import javax.net.ssl._
import java.sql.SQLException

import JsonHelper._

/**
  * Bypasses both client and server validation.
  */
object TrustAll extends X509TrustManager {
  /** turn off SSL Issuer list */
  val getAcceptedIssuers = null

  /**
    * bypass client SSL Checker
    * @param x509Certificates which certificates should be trusted
    * @param s server / url
    */
  override def checkClientTrusted(x509Certificates: Array[X509Certificate], s: String): Unit = {}

  /**
    * bypass server SSL Checker
    * @param x509Certificates which certificates should be trusted
    * @param s server / url
    */
  override def checkServerTrusted(x509Certificates: Array[X509Certificate], s: String): Unit = {}
}

/**
  * Verifies all host names by simply returning true.
  */
object VerifiesAllHostNames extends HostnameVerifier {
  /**
    * method which verifies a SSL Session. Always return true, so no check is done. This is for development mode only
    * @param s url
    * @param sslSession https ssl session
    * @return Boolean, always true
    */
  def verify(s: String, sslSession: SSLSession): Boolean = true
}
/**
  * The Communication with Kafka and the databases will be added here
  *
  * @author Vlad Sokyrsky
  */
object SQLChecker extends App {
  /** used in naming */
  final val TASKID = "taskid"
  /** used in naming */
  final val DATA = "data"
  /** used in naming */
  final val ULDIR = "upload-dir/"
  /*
  private val t1 = new SQLTask("testfiles", "23");
  t1.saveTask()
  //private val (msg0, res0) = t1.runSubmission("select * from mitarbeiter", "vowk21")
  //private val (msg1, res1) = t1.runSubmission("select * from hotel where hotel.HName like \"%City%\" and hotel.PLZ between 80000 and 84000", "kdod24")
  private val (msg2, res2) = t1.runSubmission("select * from hotel", "vowk23")
  */
  private val SYSTEMIDTOPIC = "sqlchecker"
  private val CHECK_REQUEST_TOPIC = SYSTEMIDTOPIC + "_check_request"
  private val CHECK_ANSWER_TOPIC = SYSTEMIDTOPIC + "_check_answer"
  private val TASK_REQUEST_TOPIC = SYSTEMIDTOPIC + "_new_task_request"
  private val TASK_ANSWER_TOPIC = SYSTEMIDTOPIC + "_new_task_answer"

  private implicit val system: ActorSystem = ActorSystem("akka-system")
  private implicit val materializer: Materializer = ActorMaterializer()
  private implicit val ec: ExecutionContextExecutor = system.dispatcher

  private val logger = system.log
  private val LABEL_ERROR_DOWNLOAD = "Error when downloading file!"
  private val LABEL_TASKID = "taskid"
  private val LABEL_ACCEPT = "accept"
  private val LABEL_ERROR = "error"
  private val LABEL_FALSE = "false"

  private val producerSettings = ProducerSettings(system, new StringSerializer, new StringSerializer)
  private val consumerSettings = ConsumerSettings(system, new StringDeserializer, new StringDeserializer)

  private val control_submission = Consumer
    .plainSource(consumerSettings, Subscriptions.topics(CHECK_REQUEST_TOPIC))
    .toMat(Sink.foreach(onSubmissionReceived))(Keep.both)
    .mapMaterializedValue(DrainingControl.apply)
    .run()

  private val control_task = Consumer
    .plainSource(consumerSettings, Subscriptions.topics(TASK_REQUEST_TOPIC))
    .toMat(Sink.foreach(onTaskReceived))(Keep.both)
    .mapMaterializedValue(DrainingControl.apply)
    .run()

  // Correctly handle Ctrl+C and docker container stop
  sys.addShutdownHook({
    control_submission.shutdown().onComplete {
        case Success(_) => logger.info("Exiting ...")
        case Failure(err) => logger.warning(err.getMessage)
      }
    control_task.shutdown().onComplete {
        case Success(_) => logger.info("Exiting ...")
        case Failure(err) => logger.warning(err.getMessage)
      }
  })

  private def sendMessage(record: ProducerRecord[String, String]): Future[Done] =
    akka.stream.scaladsl.Source.single(record).runWith(Producer.plainSink(producerSettings))
  private def sendCheckMessage(message: String): Future[Done] = sendMessage(new ProducerRecord[String, String](CHECK_ANSWER_TOPIC, message))
  private def sendTaskMessage(message: String): Future[Done] = sendMessage(new ProducerRecord[String, String](TASK_ANSWER_TOPIC, message))

  // +++++++++++++++++++++++++++++++++++++++++
  //                Network Settings
  // +++++++++++++++++++++++++++++++++++++++++
  private val sslContext = SSLContext.getInstance("SSL")
  sslContext.init(null, Array(TrustAll), new java.security.SecureRandom())
  HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.getSocketFactory)
  HttpsURLConnection.setDefaultHostnameVerifier(VerifiesAllHostNames)

  private def onSubmissionReceived(record: ConsumerRecord[String, String]): Unit = {
    val jsonMap: Map[String, Any] = record.value()
    try {
      val submit_type: String = jsonMap("submit_typ").asInstanceOf[String]
      val submissionid: String = jsonMap("submissionid").asInstanceOf[String]
      val taskid: String = jsonMap(TASKID).asInstanceOf[String]
      val userid: String = jsonMap("userid").asInstanceOf[String]
      var userquery: String = ""
      if(submit_type.equals("file")){
        val url: String = jsonMap("fileurl").asInstanceOf[String]
        val jwt_token: String = jsonMap("jwt_token").asInstanceOf[String]
        val s: String = downloadFileToString(url, jwt_token)
        logger.warning("submissionfile received:\n" + s)
        userquery = s
      }
      else if (submit_type.equals(DATA)){
        userquery = jsonMap(DATA).asInstanceOf[String]
      }
      //do more stuff here !.. (run the damn submission)
      val task: SQLTask = new SQLTask(ULDIR + taskid, taskid)
      var passed: Int = 0
      val (msg, success) = task.runSubmission(userquery, userid)
      if (success){
        passed = 1
      }
      sendCheckMessage(JsonHelper.mapToJsonStr(Map(
        DATA -> msg,
        "passed" -> passed.toString,
        "userid" -> userid,
        LABEL_TASKID -> taskid,
        "submissionid" -> submissionid
      )))
    } catch {
      case e: NoSuchElementException => {
        sendCheckMessage(JsonHelper.mapToJsonStr(Map(
          "Error" -> "Please provide valid parameters"
        )))
      }
    }
  }

    private def onTaskReceived(record: ConsumerRecord[String, String]): Unit = {
    val jsonMap: Map[String, Any] = record.value()
    try{
      logger.warning(SYSTEMIDTOPIC + "-task received");
      val sslContext = SSLContext.getInstance("SSL")
      sslContext.init(null, Array(TrustAll), new java.security.SecureRandom())
      HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.getSocketFactory)
      HttpsURLConnection.setDefaultHostnameVerifier(VerifiesAllHostNames)

      val urls: List[String] = jsonMap("testfile_urls").asInstanceOf[List[String]]
      val taskid: String = jsonMap(TASKID).asInstanceOf[String]
      val jwt_token: String = jsonMap("jwt_token").asInstanceOf[String]
      if (urls.length != 2) {
        sendTaskMessage(JsonHelper.mapToJsonStr(Map(LABEL_ACCEPT -> LABEL_FALSE, LABEL_ERROR -> "Please provide exact two testfiles", LABEL_TASKID -> taskid)))
      }
      else {
        deleteDirectory(new File(Paths.get(ULDIR).resolve(taskid).toString))
        downloadFilesToFS(urls, jwt_token, taskid)
        //checking for sqlexception
        val task: SQLTask = new SQLTask(ULDIR + taskid, taskid)
        sendTaskMessage(JsonHelper.mapToJsonStr(Map(LABEL_ACCEPT -> "true", LABEL_ERROR -> "", LABEL_TASKID -> taskid)))
      }
    } catch {
      case e: NoSuchElementException => {
        sendTaskMessage(JsonHelper.mapToJsonStr(Map(
          LABEL_ERROR -> "Please provide valid parameters",
          LABEL_ACCEPT -> LABEL_FALSE,
          LABEL_TASKID -> ""
        )))
      }
      case ex: SQLException => {
        sendTaskMessage(JsonHelper.mapToJsonStr(Map(
          LABEL_ACCEPT -> LABEL_FALSE,
          LABEL_ERROR ->  ex.getMessage,
          LABEL_TASKID -> "")))
      }
    }
  }

  private def downloadFilesToFS(urlnames: List[String], jwt_token: String, taskid: String) = {
    val timeout = 1000
    for(urlname <- urlnames){
      val url = new java.net.URL(urlname)
      val urlParts = urlname.split("/")
      // syntax of testfile url allows us to get filename
      val filename = URLDecoder.decode(urlParts(urlParts.length-1), StandardCharsets.UTF_8.toString)
      val connection = url.openConnection().asInstanceOf[HttpURLConnection]
      connection.setRequestProperty("Authorization", "Bearer: " + jwt_token)
      connection.setConnectTimeout(timeout)
      connection.setReadTimeout(timeout)
      connection.setRequestProperty("Connection", "close")
      connection.connect()

      if(connection.getResponseCode >= 400){
        logger.error(LABEL_ERROR_DOWNLOAD)
      }
      else {
        new File(Paths.get(ULDIR).resolve(taskid).toString).mkdirs()
        Files.copy(connection.getInputStream, Paths.get(ULDIR).resolve(taskid).resolve(filename), StandardCopyOption.REPLACE_EXISTING)
      }
    }
  }

  /**
    * download a file and parse it to string
    * @author Vlad Sokyrskyy Benjamin Manns
    * @param urlname URL where file is located
    * @param jwt_token Authorization token
    * @return The string provided in the file
    */
  private def downloadFileToString(urlname: String, jwt_token: String): String = {
    var s: String = ""
    val timeout = 1000
    val url = new java.net.URL(urlname)

    val connection = url.openConnection().asInstanceOf[HttpURLConnection]
    connection.setRequestProperty("Authorization", "Bearer: " + jwt_token)
    connection.setConnectTimeout(timeout)
    connection.setReadTimeout(timeout)
    connection.setRequestProperty("Connection", "close")
    connection.connect()

    if(connection.getResponseCode >= 400){
      logger.error(LABEL_ERROR_DOWNLOAD)
    }
    else {
      Files.copy(connection.getInputStream, Paths.get("upload-dir/script.sh"), StandardCopyOption.REPLACE_EXISTING)
      val in: InputStream = connection.getInputStream
      val br: BufferedReader = new BufferedReader(new InputStreamReader(in))
      s = Iterator.continually(br.readLine()).takeWhile(_ != null).mkString("\n")
    }
    s
  }
  /**
   * Delets a dir recursively deleting anything inside it.
   * @author https://stackoverflow.com/users/306602/naikus by https://stackoverflow.com/a/3775864/5885054
   * @param dir The dir to delete
   * @return true if the dir was successfully deleted
   */
  private def deleteDirectory(dir: File): Boolean = {
    if (!dir.exists() || !dir.isDirectory()) {
      false
    } else {
      val files = dir.list()
      for (file <- files) {
        val f = new File(dir, file)
        if (f.isDirectory()) {
          deleteDirectory(f)
        } else {
          f.delete()
        }
      }
      dir.delete()
    }
  }
}