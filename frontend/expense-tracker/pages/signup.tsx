import Inputs, { InputLable } from "@/components/input";
import { INPUT_TYPE } from "@/constant/constant";
import { SIGNUP_COMPONENTS } from "@/constant/interfaces";
import { register } from "@/services/apiServices";
import { useRouter } from "next/router";

import { FormEvent, ReactNode, useState } from "react";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Register(): ReactNode {
    try {
        const router = useRouter();

        const [signUpDetails, setSignUpDetails] = useState<SIGNUP_COMPONENTS>({
            password: "",
            cPassword: "",
            email: ""
        });

        const submitForm: (e: FormEvent)=> void = async (e) => {
            e.preventDefault();

            if (!signUpDetails.email || signUpDetails.email === "") {
                toast.warn("Hey without email, How can we Identify its who you are 🤔, Can you please enter your email");
                return;
            }

            if (!signUpDetails.password || signUpDetails.password === "") {
                toast.warn("The Password field is required as its important to know its actually, Hope you understand 🥺 ");
                return;
            }

            if (signUpDetails.cPassword !== signUpDetails.password) {
                toast.warning("Unfortunately the password is not matching 😔, Can you try remembering again 🤔, And enter again 🤩");
                return;
            }

            const responseData = await register({
                email: signUpDetails.email,
                password: signUpDetails.password
            });

            if (responseData.error) {
                toast.error(responseData.errorMessage)
            } else {
                router.push('/login');
            }
        } 
        return (
            <div className="max-w-md mx-auto bg-white shadow-md rounded px-8 py-6 ">
                <h2 className="text-xl font-semibold mb-4 text-center">Register</h2>
                <form onSubmit={submitForm}>
                    <ToastContainer />
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