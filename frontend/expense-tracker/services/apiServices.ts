import { 
    API, 
    API_PATH, 
    ErrorDisplayMessage, 
    LoginResponse, 
    RegisterAPIRequest, 
    RegisterResponse, 
    LoginAPIRequest, 
    LoginReturnData, 
    RegisterReturnData 
} from "@/constant/api";
import { ENV, ENV_TYPE } from "@/constant/constant";

/**
 * Makes a request to the login API endpoint with the given login credentials.
 * @param props - The login credentials to be sent with the request.
 * @returns A response containing the login data and any errors that occurred.
 */
export async function login(props: LoginAPIRequest): Promise<LoginReturnData> {
    try {
        const response = await fetch(API + API_PATH.LOGIN, {
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

        let errorMessage: string = ErrorDisplayMessage.DEFAULT;
        if (ENV === ENV_TYPE.DEV) {
            errorMessage = (error as Error).message;
        }
        return {
            loginData: undefined,
            errorMessage,
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
        const response = await fetch(API+API_PATH.REGISTER, {
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
        let errorMessage: string = ErrorDisplayMessage.DEFAULT;

        if (ENV === ENV_TYPE.DEV) {
            errorMessage = (error as Error).message;
        }
        return {
            error: true,
            errorMessage,
        }
    }
}