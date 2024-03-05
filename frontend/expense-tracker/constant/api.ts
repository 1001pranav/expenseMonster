export const LOCAL_API = "http://localhost:8080"

export const API = LOCAL_API;

export const API_PATH = {
    "LOGIN": "/user/login",
    "REGISTER": "/user/register",
}

export const STATUS_MESSAGES = {
    "SUCCESS": "SUCCESS"
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


export const FE_GENERIC_ERROR_MESSAGE: string = "Problem is with us, Please give us time to fix the issue";

export const BE_GENERIC_ERROR: string = "Hey we have messed up. Can you please wait lil, We will be fix it soon";

export const ErrorDisplayMessage: {[key: string]: string} = {
    INVALID_REQUEST: FE_GENERIC_ERROR_MESSAGE,
    REQUIRED_EMAIL: "Missing email_id, Please enter email its important for us to identify you",
    REQUIRED_PASSWORD: "You haven't entered your password, Its Important to authenticate",
    INVALID_EMAIL_OR_PASSWORD: "Unfortunately Email 'Address' or 'Password' you entered is incorrect, Please try again with a different one",
    INTERNAL_SERVER_ERROR: BE_GENERIC_ERROR,
    DEFAULT: "We are figuring out what went wrong 😭 "
}