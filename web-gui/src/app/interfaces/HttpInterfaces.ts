/**
 * General information of course.
 * Used to show for list of Courses
 */
export interface GeneralCourseInformation {
  course_name: string;
  course_description: string;
  course_id: number;
  course_semester: string;
  course_modul_id: string;
  role_name: string;
  role_id: number;
  course_tutor: GeneralCourseDocent[];
  course_docent: GeneralCourseDocent[];
}

interface GeneralCourseDocent {
  user_id: number;
  prename: string;
  surname: string;
  email: string;
}

/**
 * Detailed information of course.
 * Used to show CourseTasks of one course
 */
export interface DetailedCourseInformation {
  course_id: number;
  course_name: string;
  course_description: string;
  creator: number;
  tasks: CourseTask[];
}

/**
 * Task of one course
 */
export interface CourseTask {
  testsystem_id: string;
  submit_date?: Date;
  exitcode: number;
  result: string;
  submission_data: string;
  task_name: string;
  passed?: boolean;
  deadline: Date;
  result_date: Date;
  file: string;
  task_id: number;
  task_description: string;
}


/**
 * Information after user logged in.
 * Resend data comes when user needs to accept
 * privacy policy
 */
export interface AfterLogin {
  login_result: boolean;
  show_privacy: boolean;
  resend_data?: {
    username: string
  };
}

/**
 * Gives back if something succeeded
 */
export interface Succeeded {
  success: boolean;
}

/**
 * After creating/submitting or updating a task,
 * response sends an upload url
 * to which the solution file should be uploaded.
 * Submission id only comes back if a submission is done.
 */
export interface FileUpload {
  success: boolean;
  taskid: number;
  submissionid: number;
  upload_url: string;
}

/**
 * Gives back which role admin has changed
 * and if it was successful
 */
export interface RoleChanged {
  grant: string;
  success: boolean;
}


export interface User {
  email: string;
  username: string;
  surname: string;
  role_id: number;
  user_id: number;
  prename: string;
  last_login?: Date;
}

export interface Testsystem {
  name: string;
  testsystem_id: string;
  description: string;
  supported_formats: string;
}

export enum TextType {
  Dataprivacy = 'privacy_text',
  Impressum = 'impressum_text'
}