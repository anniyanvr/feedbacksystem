import {AfterViewChecked, Component, Inject, OnInit} from '@angular/core';
import {delay, flatMap, retryWhen, take} from 'rxjs/operators';
import {ActivatedRoute, Router} from '@angular/router';
import {TitlebarService} from '../../../service/titlebar.service';
import {
  CourseTask, CourseTaskEvaluation,
  DetailedCourseInformation,
  NewTaskInformation,
  Succeeded,
  SucceededUpdateTask
} from '../../../interfaces/HttpInterfaces';
import {DatabaseService} from '../../../service/database.service';
import {MatDialog, MatSnackBar} from '@angular/material';
import {NewtaskDialogComponent} from './newtask-dialog/newtask-dialog.component';
import {UserService} from '../../../service/user.service';
import {ExitCourseComponent} from './exit-course/exit-course.component';
import {of, throwError} from 'rxjs';

import {UpdateCourseDialogComponent} from './update-course-dialog/update-course-dialog.component';
import {DOCUMENT} from '@angular/common';
import {DeleteCourseModalComponent} from "../modals/delete-course-modal/delete-course-modal.component";
import {DeleteTaskModalComponent} from "../modals/delete-task-modal/delete-task-modal.component";
import {AnswerFromTestsystemDialogComponent} from "../modals/answer-from-testsystem-dialog/answer-from-testsystem-dialog.component";
import {CourseParameterModalComponent} from "./course-parameter-modal/course-parameter-modal.component";
import {CourseParameterUserModalComponent} from "./course-parameter-user-modal/course-parameter-user-modal.component";
import {UploadPlagiatScriptComponent} from "../modals/upload-plagiat-script/upload-plagiat-script.component";
import set = Reflect.set;
import {MatTabChangeEvent} from "@angular/material/tabs";
import {DomSanitizer} from "@angular/platform-browser";

/**
 * Shows a course in detail
 */
@Component({
  selector: 'app-detail-course',
  templateUrl: './detail-course.component.html',
  styleUrls: ['./detail-course.component.scss']
})
export class DetailCourseComponent implements OnInit, AfterViewChecked {


  constructor(private db: DatabaseService, private route: ActivatedRoute, private titlebar: TitlebarService,
              private dialog: MatDialog, private user: UserService, private snackbar: MatSnackBar, private sanitizer: DomSanitizer,
              private router: Router, @Inject(DOCUMENT) document) {
  }

  courseDetail: DetailedCourseInformation = <DetailedCourseInformation>{};
  courseTasks: CourseTask[];
  userRole: string;
  submissionData: { [task: number]: File | string };
  processing: { [task: number]: boolean };
  submissionAsFile: { [task: number]: string };
  deadlineTask: { [task: number]: boolean };
  courseID: number;
  breakpoint: number;
  multipleChoices: { [task: number]: boolean };
  taskID: number;
  hasScrolledToTask: boolean = false;


  private reachedDeadline(now: Date, deadline: Date): boolean {
    return now > deadline;
  }

  public submissionTypeOfTask(task: CourseTask): any[]{
    let accepted = [];
    let flagg = task.testsystems[0].accepted_input;

    if(flagg & 1){
      accepted.push({typ: "text", text: "Text"})
    }
    if((flagg >> 1) & 1){
      accepted.push({typ: "file", text: "Datei"})
    }
    if((flagg >> 2) & 1){
      accepted.push({typ: "choice", text: "Multiple Choice"})
    }

    return ['text','file','choice'].filter(v => {
      return accepted.map(v => v.typ).indexOf(v) >= 0
    });
  }

  ngOnInit() {
    this.submissionAsFile = {};
    this.processing = {};
    this.submissionData = {};
    this.deadlineTask = {};

    // Get course id from url and receive data
    this.route.params.pipe(
      flatMap(params => {
        this.courseID = +params['id'];
        this.taskID = params.taskid
        return this.db.getCourseDetail(this.courseID);
      })
    ).subscribe(course_detail => {

      if(Object.keys(course_detail).length == 0) {
        this.router.navigate(['404'])
      }

      this.courseDetail = course_detail;

      //TODO convert hack -> use other APi route
      this.courseTasks = course_detail.tasks.filter( (v: CourseTask) => v.task_id == this.taskID);


      this.userRole = course_detail.role_name;

      course_detail.tasks.forEach(task => {
        this.submissionAsFile[task.task_id] = 'task';
        this.processing[task.task_id] = false;
        this.triggerExternalDescriptionIfNeeded(task, false)
      });
      this.titlebar.emitTitle(course_detail.course_name);


      setTimeout(() => {
        if(location.hash === '#edit'){
          this.updateCourse();
        }
      },100)

    }, error => this.router.navigate(['404']))

    // Check if task reached deadline
    setInterval(() => {
      if (this.courseTasks) {
        this.courseTasks.forEach(task => {
            if (task.deadline) {
              this.deadlineTask[task.task_id] = this.reachedDeadline(new Date(), new Date(task.deadline));
            }
          }
        );
      }
    }, 1000);


    this.breakpoint = (window.innerWidth <= 400) ? 1 : 3;
  }

  private externalInfoPoller(task: CourseTask, step: number){
    if (step > 10) {
      this.snackbar.open('Leider konnte keine externe Aufgabenstellung geladen werden.', 'OK', {duration: 5000});
      return
    }
    this.db.getTaskResult(task.task_id).toPromise()
      .then((loadedTask: CourseTask) => {
        if (loadedTask.external_description != null){
          this.courseTasks[this.courseTasks.indexOf(task)] = loadedTask;
          if(this.externalInfoIsForm(loadedTask)) this.submissionAsFile[loadedTask.task_id] = 'choice'
        } else {
          setTimeout(() => {
            this.externalInfoPoller(task, step+1)
          }, 5000)
        }
      })
  }

  externalInfoIsForm(task: CourseTask) {
    if(!task.load_external_description || !task.external_description) {
      return false
    } else {
      try{
        return JSON.parse(task.external_description)
      } catch (e) {
        return false
      }

    }

  }


  public triggerExternalDescriptionIfNeeded(task: CourseTask, force: Boolean){
    if (force) {
      task.external_description = ""
    }
    if (task.load_external_description && task.external_description == null || force){
      this.db.triggerExternalInfo(task.task_id, task.testsystems[0].testsystem_id).toPromise().then(() => {
        this.externalInfoPoller(task, 0)
      }).catch(() => {
        this.snackbar.open('Leider konnte keine externe Aufgabenstellung geladen werden.', 'OK', {duration: 5000});
      })
    }

  }

  onResize(event) {
    this.breakpoint = (event.target.innerWidth <= 400) ? 1 : 3;
  }

  private loadCourseDetailsTasks(){
    this.db.getCourseDetail(this.courseID).toPromise()
      .then(course_detail => {
          this.courseTasks = course_detail.tasks.filter( (v: CourseTask) => v.task_id == this.taskID);
      })
  }

  private loadCourseDetails(){
    this.db.getCourseDetail(this.courseID).toPromise()
      .then(course_detail => {
        this.courseDetail = course_detail
      })
  }

  public openSettings(){
    if(this.isAuthorized())
      this.dialog.open(CourseParameterModalComponent, {data:{courseid:this.courseID}})
    else
      this.dialog.open(CourseParameterUserModalComponent, {data:{courseid:this.courseID}})
  }

  public exportSubmissions(){
    this.db.exportCourseSubmissions(this.courseID, this.courseDetail.course_name)
  }

  public plagiatModule(courseDetail: DetailedCourseInformation){
    this.dialog.open(UploadPlagiatScriptComponent, { data: {courseid: this.courseID}}).afterClosed()
      .toPromise()
      .then((close) => {
        if(close){
          this.loadCourseDetails()
        }
      })
  }

  public deleteCourse(courseDetail: DetailedCourseInformation){
    this.dialog.open(DeleteCourseModalComponent, {
      data: {coursename: courseDetail.course_name, courseID: courseDetail.course_id}
    }).afterClosed().pipe(
      flatMap(value => {
        if (value.exit) {
          return this.db.deleteCourse(courseDetail.course_id)
        }
      })
    )
      .toPromise()
      .then( (value: Succeeded) => {
        if(typeof value == "undefined"){
          return ;
        }
        if(value.success){
          this.snackbar.open('Kurs mit der ID ' + courseDetail.course_id + ' wurde gelöscht', 'OK', {duration: 5000});
        } else {
          this.snackbar.open('Leider konnte der Kurs ' + courseDetail.course_id + ' nicht gelöscht werden. Dieser Kurs scheint nicht zu existieren.', 'OK', {duration: 5000});
        }
      })
      .catch(() => {
        this.snackbar.open('Leider konnte der Kurs ' + courseDetail.course_id + ' nicht gelöscht werden. Wahrscheinlich hast du keine Berechtigung', 'OK', {duration: 5000});
      })
      .then(() => {
        this.router.navigate(['courses'])
      })
  }

  public isAuthorized(){
    return this.userRole === 'docent' || this.userRole === 'admin' || this.userRole === 'moderator' || this.userRole === 'tutor'
  }

  public runAllTaskAllUsers(taskid: number){
    this.db.runAllCourseTaskByDocent(this.courseID, taskid)
  }

  ngAfterViewChecked() {
    // If url fragment with task id is given, scroll to that task
    this.route.fragment.subscribe(taskIDScroll => {
      const elem = document.getElementById(taskIDScroll);
      if (elem && !this.hasScrolledToTask) {
        elem.scrollIntoView();
        this.hasScrolledToTask = true;
      }
    });
  }

  reRunTask(task: CourseTask){
    this.submissionData[task.task_id] = task.submission_data
    this.submitTask(task)
  }

  public isInFetchingResultOfTasks(task: CourseTask){
    let tasksystemPassed = task.evaluation
      .map( (eva:CourseTaskEvaluation) => eva.passed )
     let tasksystemNulls = tasksystemPassed.filter(passed => {
                              return (passed == null || typeof passed === undefined)
                            });
    if(tasksystemPassed.indexOf(false) >= 0){
      return false
    } else {
      return tasksystemNulls.length > 0
    }
  }

  private submitTask(currentTask: CourseTask) {
    this.processing[currentTask.task_id] = true;
    this.db.submitTask(currentTask.task_id, this.submissionData[currentTask.task_id]).subscribe(res => {
      this.submissionData[currentTask.task_id] = '';
      if (res.success) {
        this.db.getTaskResult(currentTask.task_id).pipe(
          flatMap(taskResult => {

            this.courseTasks[this.courseTasks.indexOf(currentTask)] = taskResult;

            if (this.isInFetchingResultOfTasks(taskResult)) {
              return throwError('No result yet');
            }
            return of(taskResult);
          }),
          retryWhen(errors => errors.pipe(
            delay(5000),
            take(120)))
        ).subscribe(taskResult => {
          this.processing[currentTask.task_id] = false;

          let index = -1
          for(let k in this.courseTasks){
            if(this.courseTasks[k].task_id == currentTask.task_id){
              index = parseInt(k); // stupid TS, it is an int, always will be
              break;
            }
          }
          this.courseTasks[index] = taskResult;
        });

      }
    });
  }

  /**
   * Opens dialog for creation of new task
   * @param course The course data for dialog
   */
  createTask(course: DetailedCourseInformation) {
    this.dialog.open(NewtaskDialogComponent, {
      height: 'auto',
      width: 'auto',
      data: {courseID: course.course_id}
    }).afterClosed().pipe(
      flatMap((value) => {
        if (value.success) {
          this.snackbar.open('Erstellung der Aufgabe erfolgreich', 'OK', {duration: 3000});
          this.waitAndDisplayTestsystemAcceptanceMessage(value.taskid)
        }
        return this.db.getCourseDetail(course.course_id);
      })
    ).subscribe(course_detail => {
      this.courseTasks = course_detail.tasks;
      this.courseTasks.forEach(task => {
        if(typeof this.submissionAsFile[task.task_id] == 'undefined'){

          if(this.externalInfoIsForm(task))
            this.submissionAsFile[task.task_id] = 'choice'
          else
            this.submissionAsFile[task.task_id] = 'text';
        }
      })

    });
  }



  private waitAndDisplayTestsystemAcceptanceMessage(taskid: number) {
    setTimeout(() => {
      this.db.getTaskResult(taskid).pipe(
        flatMap((taskResult: NewTaskInformation) => {
          let acceptance_flaggs = (taskResult.testsystems.map(t => t.test_file_accept))

          if (acceptance_flaggs.indexOf(null) < 0) {
            this.dialog.open(AnswerFromTestsystemDialogComponent, {data: taskResult})
            return of({success: true})
          } else {
            return throwError('Not all results yet');
          }
        }),
        retryWhen(errors => errors.pipe(
          delay(5000),
          take(50)))
      ).toPromise()
        .then(d => {
          if (typeof d == 'undefined') {
            this.dialog.open(AnswerFromTestsystemDialogComponent, {data:{no_reaction:true}})
          }
        })
        .catch((e) => {

        })
    }, 2000)
  }

  displayTestsystemFeedback(task){
    this.db.getTaskResult(task.task_id).toPromise()
      .then((data: NewTaskInformation) => {
        this.dialog.open(AnswerFromTestsystemDialogComponent, {data:data})
      }).catch(() => {

    })
  }

  /**
   * Opens dialog to update task
   * @param task The task to update
   */
  updateTask(task: CourseTask) {
    this.dialog.open(NewtaskDialogComponent, {
      height: 'auto',
      width: 'auto',
      data: {
        task: task
      }
    }).afterClosed().pipe(
      flatMap((value: SucceededUpdateTask) => {
        if (value.success) {
          this.snackbar.open('Update der Aufgabe ' + task.task_name + ' erfolgreich', 'OK', {duration: 3000});
          this.waitAndDisplayTestsystemAcceptanceMessage(task.task_id)

        }
        return this.db.getCourseDetail(this.courseDetail.course_id);
      })
    ).subscribe(course_detail => {
      this.courseTasks = course_detail.tasks;
    });
  }

  /**
   * Opens snackbar and asks
   * if docent/tutor really wants to delete
   * this task
   * @param task The task that will be deleted
   */
  deleteTask(task: CourseTask) {
    this.dialog.open(DeleteTaskModalComponent, {
      data: {taskname: task.task_name}
    }).afterClosed().pipe(
      flatMap(value => {
        if (value.exit) {
          return this.db.deleteTask(task.task_id)
        }
      })
    ).toPromise()
      .then( (value: Succeeded) => {
        if(value.success){
          this.snackbar.open('Aufgabe ' + task.task_name + ' wurde gelöscht', 'OK', {duration: 3000});
          this.loadCourseDetailsTasks()
        } else {
          this.snackbar.open('Aufgabe ' + task.task_name + ' konnte nicht gelöscht werden', 'OK', {duration: 3000});
        }
      })
      .catch((e) => {
        this.snackbar.open('Es gab ein Datenbankfehler, Aufgabe ' + task.task_name + ' konnte nicht gelöscht werden', 'OK', {duration: 3000});
      })
  }

  /**
   * Get file user wants to submit
   * @param file The file user submits
   * @param currentTask The current task to get file from
   */
  getSubmissionFile(file: File, currentTask: CourseTask) {
    this.submissionData[currentTask.task_id] = file;
  }

  updateSubmissionContent(payload: any){
    this.submissionData[payload['taskid']] = payload['content'];
  }

  /**
   * Submission of user solution
   * @param courseID Current course
   * @param currentTask The current task for submission
   */
  submission(courseID: number, currentTask: CourseTask) {
    if (this.submissionData[currentTask.task_id] == null) {
      this.snackbar.open('Sie haben keine Lösung für die Aufgabe ' + currentTask.task_name + ' abgegeben', 'Ups!');
      return;
    }

    // if user submits but there is a pending submission
    if (currentTask.submit_date && this.isInFetchingResultOfTasks(currentTask)) {
      this.snackbar.open('Für Aufgabe "' + currentTask.task_name +
        '" wird noch auf ein Ergebnis gewartet, trotzdem abgeben ?', 'Ja', {duration: 10000})
        .onAction()
        .subscribe(() => {
          this.submitTask(currentTask);
        });
    } else {
      this.submitTask(currentTask);
    }
  }

  /**
   * Unsubscribe course
   * @param courseName The name to show user
   * @param courseID The id of current course
   */
  exitCourse(courseName: string, courseID: number) {
    this.dialog.open(ExitCourseComponent, {
      data: {coursename: courseName}
    }).afterClosed().pipe(
      flatMap(value => {
        if (value.exit) {
          return this.db.unsubscribeCourse(courseID);
        }
      })
    ).subscribe(res => {
      if (res.success) {
        this.snackbar.open('Du hast den Kurs ' + courseName + ' verlassen', 'OK', {duration: 3000});
        this.router.navigate(['courses', 'user']);
      }
    });
  }

  /**
   * Opens dialog to update course information
   */
  updateCourse() {
    this.dialog.open(UpdateCourseDialogComponent, {
      height: '600px',
      width: '800px',
      data: {data: this.courseDetail}
    }).afterClosed().subscribe((value: Succeeded) => {
      location.hash = ''
      if (value.success) {
        this.db.getCourseDetail(this.courseID).subscribe(courses => {
          this.courseDetail = courses;
          this.titlebar.emitTitle(this.courseDetail.course_name);
        });
      }
    });
  }

  /**
   * If user gets course directly from link
   */
  subscribeCourse() {
    this.db.subscribeCourse(this.courseID).pipe(
      flatMap(success => {
        if (success.success) {
          this.snackbar.open('Kurs ' + this.courseDetail.course_name + ' beigetreten', 'OK', {duration: 3000});
          return this.db.getCourseDetail(this.courseID);
        }
      })
    ).subscribe(courseDetail => {
      this.courseDetail = courseDetail;
      this.courseTasks = courseDetail.tasks;
    });
  }

  tabChanged(event: MatTabChangeEvent) {

  }

  get plagiarism_script_status(){
    return (this.courseDetail.plagiarism_script) ? "primary" : "warn";
  }
}
