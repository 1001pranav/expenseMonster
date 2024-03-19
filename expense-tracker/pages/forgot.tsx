import { FormEventHandler, ReactNode, useState } from "react";
import { ToastContainer, toast } from 'react-toastify';
import { useRouter } from "next/router";
import 'react-toastify/dist/ReactToastify.css';

import { INPUT_TYPE } from "@/constant/constant";
import Inputs, { InputLable } from "@/components/input";
import { SIGNUP_COMPONENTS } from "@/constant/interfaces";

export default function (): ReactNode {
    try {
        
        const [signUpDetails, setSignUpDetails] = useState<SIGNUP_COMPONENTS>({
            password: "",
            cPassword: "",
            email: ""
        });

        const submitForm: (e: any) => void = (e) => {

        }
        return (
            <div className="max-w-md mx-auto bg-white shadow-md rounded px-8 py-6 ">
                <h2 className="text-xl font-semibold mb-4 text-center">Register</h2>
                <form onSubmit={submitForm}>

                    <ToastContainer  />
                    <div className="mb-4">
                        <InputLable 
                            lableClassName="block text-gray-700 text-sm font-bold mb-2" 
                            lableName="Email ID"
                            inputType={INPUT_TYPE.EMAIL}
                            placeholders="Enter your Email Address"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                            name="email"
                            value={signUpDetails?.email ?? ""}
                            handleInput={ 
                                (event) => setSignUpDetails(
                                {
                                    ...signUpDetails,
                                    email: event.target.value
                                })
                            }
                        />
                    </div>
                    <div className="mb-4">
                        <InputLable
                            lableClassName="block text-gray-700 text-sm font-bold mb-2" 
                            lableName="Password"
                            inputType={INPUT_TYPE.PASSWORD}
                            placeholders="Password"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                            name="password"
                            value={signUpDetails?.password ?? ""}
                            handleInput={
                                (event) => setSignUpDetails({
                                    ...signUpDetails,
                                    password: event.target.value
                                })
                            }
                        />
                    </div>
                    <div className="mb-6">
                        <InputLable
                            lableClassName="block text-gray-700 text-sm font-bold mb-2" 
                            lableName="Confirm Password"
                            inputType={INPUT_TYPE.PASSWORD}
                            placeholders="Confirm Password"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                            name="cPassword"
                            value={signUpDetails?.cPassword ?? ""}
                            handleInput={
                                (event) => setSignUpDetails({
                                    ...signUpDetails,
                                    cPassword: event.target.value 
                                })
                            }
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Inputs 
                            inputType={INPUT_TYPE.SUBMIT} 
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-4"
                            name="Register"
                        />
                        
                    </div>
                </form>
            </div>
        )
    } catch (error) {
        console.error("Error: onRegister", error);
    }
}