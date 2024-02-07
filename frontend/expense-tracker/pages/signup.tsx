import Inputs, { InputLable } from "@/components/input";
import { INPUT_TYPE } from "@/constant/constant";
import { SIGNUP_COMPONENTS } from "@/constant/interfaces";
import { useState } from "react";

export default function Register() {
    try {
        
        const [signUpDetails, setSignUpDetails] = useState<SIGNUP_COMPONENTS>({
            username: "",
            password: "",
            cPassword: "",
            email: ""
        });

        return (
            <div className="max-w-md mx-auto bg-white shadow-md rounded px-8 py-6 ">
                <h2 className="text-xl font-semibold mb-4 text-center">Register</h2>
                <form>
                    <div className="mb-4">
                        <InputLable 
                            lableClassName="block text-gray-700 text-sm font-bold mb-2" 
                            lableName="Username"
                            inputType={INPUT_TYPE.TEXT}
                            placeholders="Enter your username"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                            name="username"
                            value={signUpDetails?.username ?? ""}
                            handleInput={
                                (event)=> setSignUpDetails({
                                    ...signUpDetails, 
                                    username: event.target.value 
                                })
                            }
                        />
                    </div>
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