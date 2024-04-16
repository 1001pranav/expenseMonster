import { FormEvent, ReactNode, useState } from "react";
import { toast } from 'react-toastify';
import { useRouter } from "next/router";
import 'react-toastify/dist/ReactToastify.css';

import { INPUT_TYPE } from "@/constant/constant";
import Inputs, { InputLable } from "@/components/input";
import { FORGOT_PASSWORD_COMPONENTS } from "@/constant/interfaces";
import { forgotPasswordAPICall } from "@/services/apiServices";
import { ErrorDisplayMessage, ForgotPasswordAPIResponse } from "@/constant/api";

export default function (): ReactNode {
    try {
        
        const [forgotDetails, setForgotPasswordDetails] = useState<FORGOT_PASSWORD_COMPONENTS>({
            email: ""
        });

        const submitForm: (e: FormEvent<HTMLFormElement>) => void = async (e) => {
            e.preventDefault();

            if (forgotDetails.email === "") {
                toast.warn(ErrorDisplayMessage.MISSING_EMAIL);
                return;
            }

            const response: ForgotPasswordAPIResponse = await forgotPasswordAPICall({email: forgotDetails.email});

            if (response.error) {
                toast.error(response.errorMessage);
                return
            } 

            router.push({
                pathname: "/reset-password",
                query: {
                    email: forgotDetails.email
                }
            });
        }
        const router  = useRouter();
        const haveOTPRoute: () => void = async () => {
            if (forgotDetails.email === "") {
                toast.warning("Hey buddy 🥰, Can you please enter a valid email so that we can reset your password? 🥺");
                return
            }

            router.push({
                pathname: "/reset-password",
                query: {
                    email: forgotDetails.email
                }
            });
        }
        return (
            <div className="max-w-md mx-auto bg-white shadow-md rounded px-8 py-6 ">
                <h2 className="text-xl font-semibold mb-4 text-center">Forgotten Password?</h2>
                <form onSubmit={submitForm}>
                    <div className="mb-4">
                        <InputLable 
                            lableClassName="block text-gray-700 text-sm font-bold mb-2" 
                            lableName="Email ID"
                            inputType={INPUT_TYPE.EMAIL}
                            placeholders="Enter your Email Address"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                            name="email"
                            value={forgotDetails?.email ?? ""}
                            handleInput={ 
                                (event) => setForgotPasswordDetails(
                                {
                                    ...forgotDetails,
                                    email: event.target.value
                                })
                            }
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <button
                            className="text-sm hover:text-sky-500" 
                            onClick={haveOTPRoute}
                        >
                            Have OTP?
                        </button>
                        <Inputs 
                            inputType={INPUT_TYPE.SUBMIT} 
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-4"
                            name="Forgot Password"
                        />
                        
                    </div>
                </form>
            </div>
        )
    } catch (error) {
        console.error("Error: onRegister", error);
    }
}