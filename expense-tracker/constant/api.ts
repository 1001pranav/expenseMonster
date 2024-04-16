export const LOCAL_API = "http://localhost:8080"

export const API = LOCAL_API;

export const API_PATH = {
    "LOGIN": "/user/login",
    "REGISTER": "/user/register",
    "FORGOT": "/user/forgotPassword",
    "RESET": "/user/resetPassword",
}

export const FE_GENERIC_ERROR_MESSAGE: string = "Problem is with us, Please give us time to fix the issue";

export const BE_GENERIC_ERROR: string = "Hey we have messed up. Can you please wait lil, We will be fix it soon";

export const ErrorDisplayMessage: {[key: string]: string} = {
    INVALID_REQUEST: FE_GENERIC_ERROR_MESSAGE,
    REQUIRED_EMAIL: "Missing email_id, Please enter email its important for us to identify you",
    REQUIRED_PASSWORD: "You haven't entered your password, Its Important to authenticate",
    INVALID_EMAIL_OR_PASSWORD: "Unfortunately Email 'Address' or 'Password' you entered is incorrect, Please try again with a different one",

    MISSING_EMAIL: "Missing email which is necessary for sending mail to that address for identifying you are actual person",
    MISSING_OLD_PASSWORD: "Hey you forgot to enter your old password, Please try again",
    INVALID_OTP: "Hey buddy, Can  you check if entered OTP properly? we found it incorrect you get only limited chances, Please try again",
    OTP_EXPIRED: "You took too long for entering OTP. We are sorry to inform you that it has been expired, Please try again next time",
    PASSWORD_NOT_MATCHING: "The old password is not matching, Please try remembering your old password or you can reset your password",
    
    MISSING_OTP: "Hey, you need to enter OTP you received",
    REQUIRED_CPASSWORD: "Missing confirm password, You forgot the password you entered?",
    PASSWORD_CPASS_NOT_MATCH: "Hmm, The password is not matching, You forgot what you entered.",

    USER_NOT_EXISTS: "Hey we could not find your email, Please check again with email address",

    INTERNAL_SERVER_ERROR: BE_GENERIC_ERROR,
    FAILED_API_CALL: "Some issue in connection with backend, Please wait till sometime",
    DEFAULT: "We are figuring out what went wrong 😭 "
}

export interface Response {
    status: string;
    debug_errors: string;
}

export interface ResponseReturnData {
    errorMessage?: string;
    error: boolean
}

export interface LoginAPIRequest {
    email: string;
    password: string;
}

export interface LoginResponseData {
    user_id: number;
    access_token: string;
    email: string
}

export interface LoginResponse extends Response {
    data?: LoginResponseData;
}

export interface LoginReturnData extends ResponseReturnData {
    loginData?: LoginResponseData;
}

export interface RegisterAPIRequest {
    email: string;
    password: string;
}

export interface RegisterResponseData {
    user_id: number;
    email: string;
}

export interface RegisterResponse extends Response {
    data?: RegisterResponseData;
}

export interface RegisterReturnData extends ResponseReturnData {
    registerData?: RegisterResponseData;
}

export interface ForgotPasswordAPIRequest {
    email: string;
}

export interface ForgotPasswordData {
    otp: number;
    otp_expires_on: string;
}
export interface ForgotPasswordResponse extends Response {
    data?: ForgotPasswordData;
}

export interface APIResponseFunction {
    error: boolean;
    errorMessage?: string;
}

export interface LoginAPIResponse extends APIResponseFunction{
    loginData?: LoginResponseData;
}

export interface ForgotPasswordAPIResponse extends APIResponseFunction {
    forgotPasswordData ?: ForgotPasswordData;
}

export interface ResetPasswordAPIRequest {
    otp: number;
    password: string;
    password_type: number;
    email: string;
}

export interface ResetPasswordResponse extends Response {
    data: {}
}

export interface ResetPasswordResponseFunction extends APIResponseFunction {
    data: {}
}