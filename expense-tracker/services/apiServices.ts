import { 
    API, 
    API_PATH, 
    ErrorDisplayMessage, 
    LoginResponse, 
    RegisterAPIRequest, 
    RegisterResponse, 
    LoginAPIRequest, 
    LoginReturnData, 
    RegisterReturnData, 
    ForgotPasswordAPIRequest,
    ForgotPasswordAPIResponse,
    ForgotPasswordResponse,
    ResetPasswordAPIRequest,
    ResetPasswordResponse,
    ResetPasswordResponseFunction,
} from "@/constant/api";
import { ENV, ENV_TYPE } from "@/constant/constant";


/**
 * Makes a request to the login API endpoint with the given login credentials.
 * @param props - The login credentials to be sent with the request.
 * @returns A response containing the login data and any errors that occurred.
 */
export async function login(props: LoginAPIRequest): Promise<LoginReturnData> {
    try {
        const response: Response = await fetch(API + API_PATH.LOGIN, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(props),
        });

        const responseData: LoginResponse = await response.json();

        if (!response.ok) {
            let errorMessage: string = ErrorDisplayMessage[responseData.status]?? ErrorDisplayMessage.DEFAULT;

            if (ENV === ENV_TYPE.DEV) {
                console.error("Error for Login API is", responseData.debug_errors);
                errorMessage = responseData.debug_errors;
            }

            return {
                error: true,
                errorMessage,
            };
        }

        return {
            error: false,
            loginData: responseData.data,
            errorMessage: "",
        };
    } catch (error) {

        console.error("Error: On login API call", error);

        return {
            loginData: undefined,
            errorMessage: ENV === ENV_TYPE.DEV? (error as Error).message: ErrorDisplayMessage.DEFAULT,
            error: true,
        };
    }
}

/**
 * Registers a user by making a POST request to the register API endpoint.
 * 
 * @param props - The registration data including email and password.
 * @returns A promise that resolves to a RegisterReturnData object.
 * @throws If an error occurs during the API call or if the response is not successful.
 */
export async function register(props: RegisterAPIRequest): Promise<RegisterReturnData> {
    try {
        const response: Response = await fetch(API+API_PATH.REGISTER, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(props),
        });

        const responseData: RegisterResponse = await response.json();
        
        if (!response.ok) {
            let errorMessage: string = ErrorDisplayMessage[responseData.status]?? ErrorDisplayMessage.DEFAULT;

            if (ENV === ENV_TYPE.DEV) {
                console.error("Error for Register API is", responseData.debug_errors);
                errorMessage = responseData.debug_errors;
            }

            return {
                error: true,
                errorMessage,
            };
        }
        return {
            error: false,
            registerData: responseData.data,
            errorMessage: "",
        };
    } catch (error ) {

        return {
            error: true,
            errorMessage: ENV === ENV_TYPE.DEV? (error as Error).message: ErrorDisplayMessage.DEFAULT,

        }
    }
}


/**
 * Makes a request to the forgot password API endpoint with the given email.
 * @param ForgotPasswordAPIRequest - The email to be sent with the request.
 * @returns A promise that resolves to a ForgotPasswordAPIResponse object.
 * */
export async function forgotPasswordAPICall(props: ForgotPasswordAPIRequest): Promise<ForgotPasswordAPIResponse> {
    try {
        const response: Response = await fetch(API + API_PATH.FORGOT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(props),
        });

        console.log("Error: ",{response: response.ok});

        const responseData:ForgotPasswordResponse = await response.json();

        if (!response.ok) {
            let errorMessage: string = ErrorDisplayMessage[responseData.status]?? ErrorDisplayMessage.DEFAULT;

            if (ENV === ENV_TYPE.DEV) {
                console.error("Error for forgot password API is", responseData.debug_errors);
                errorMessage = responseData.debug_errors;
            }
            return {
                error: true,
                errorMessage
            }
        }

        if(responseData?.data?.otp) {
            return {
                error: false,
                errorMessage: "",
                forgotPasswordData: {
                    otp: responseData?.data?.otp ?? 0,
                    otp_expires_on: responseData?.data?.otp_expires_on?? ""
                }
            }
        }
        return {
            error: true,
            errorMessage: ErrorDisplayMessage.FAILED_API_CALL
        }
        
    } catch (error) {
        console.error("Error: ForgotPassword API calling error", error)

        return {
            error: true,
            errorMessage: ENV === ENV_TYPE.DEV ? (error as Error).message :  ErrorDisplayMessage.DEFAULT
        }
    }
}

export async function resetPasswordAPI(Props: ResetPasswordAPIRequest): Promise<ResetPasswordResponseFunction> {
    try {
        
        const response: Response = await fetch(API + API_PATH.RESET, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(Props),
        });
        const responseData: ResetPasswordResponse = await response.json();

        if (!response.ok) {
            const error = manageErrorResponse(responseData.debug_errors, responseData.status )
            return {
                ...error,
                data: {}
            };
        }
        return {
            error: false,
            errorMessage: "",
            data: {}
        }
    } catch (error) {
        let errorMessage: string = "";
        return {
            error: true,
            errorMessage,
            data: {}
        }
    }

}

function manageErrorResponse(debugErrors: string, errorStatus: string="DEFAULT"): {error: boolean, errorMessage: string} {
    try {
        let prodErrorMessage: string =  ErrorDisplayMessage[errorStatus] ??  ErrorDisplayMessage["DEFAULT"]
        return {
            error: true,
            errorMessage: ENV !== ENV_TYPE.DEV ? debugErrors: prodErrorMessage
        }
    } catch (error) {
        console.error("Error on manageErrorResponse", error);
        return {
            error: true,
            errorMessage: ENV === ENV_TYPE.DEV ? (error as Error).message :  ErrorDisplayMessage.DEFAULT
        }
    }
}