
import Inputs, { InputLable } from "@/components/input";
import { ErrorDisplayMessage } from "@/constant/api";
import { INPUT_TYPE } from "@/constant/constant";
import { RESET_PASSWORD_COMPONENTS } from "@/constant/interfaces";
import { resetPasswordAPI } from "@/services/apiServices";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useState,  FormEvent } from "react";
import { toast } from "react-toastify";

export default function (): ReactNode {
    try {
        const [resetPasswordDetails, setResetPasswordDetails] = useState<RESET_PASSWORD_COMPONENTS>({
            email: "",
            password: "",
            otp: 0,
            cPassword: ""
        });

        const [cPassMatch, setCPass] = useState<boolean>(false);
        const router = useRouter();
        //Added [] because it should only render once.
        useEffect(()=> {
            console.log(router.query)
            if (router.query?.email && typeof router.query?.email === "string" ) {
                setResetPasswordDetails({
                    email: router.query.email,
                    password: "",
                    otp: 0,
                    cPassword: ""
                })
            }
        }, [])
        
        const generateOTPRoute : () => void = () => {
            router.push("/forgot-password");
            return
        }

        const submitForm: (e: FormEvent<HTMLFormElement>) => void = async(e) => {
            e.preventDefault();
            if (resetPasswordDetails.email === "") {
                toast.warn(ErrorDisplayMessage.REQUIRED_EMAIL);
                return;
            }
            
            if (resetPasswordDetails.password === "") {
                toast.warn(ErrorDisplayMessage.REQUIRED_PASSWORD);
                return;
            }

            if (resetPasswordDetails.otp === 0) {
                toast.warn(ErrorDisplayMessage.MISSING_OTP);
                return;
            }

            if ( resetPasswordDetails.cPassword === "" ) {
                toast.warn(ErrorDisplayMessage.REQUIRED_CPASSWORD);
                return;
            }
            
            if ( resetPasswordDetails.cPassword!== resetPasswordDetails.password ) {
                setCPass(true);
                return;
            }
            
            const apiResponse = await resetPasswordAPI({
                otp: resetPasswordDetails.otp,
                password: resetPasswordDetails.password,
                password_type: 1, 
                email: resetPasswordDetails.email
            });

            if (apiResponse.error) {
                toast.warn(apiResponse.errorMessage);
                return;
            }
            toast.success("Password reset successful");
            router.push("/login");
        }
        
        // If password is not matching then it gives error message, to remove the once password matches remove error
        useEffect(()=> {
            if ( cPassMatch && resetPasswordDetails.cPassword === resetPasswordDetails.password ) {
                setCPass(false);
            }
        })

        return (  <div className="max-w-md mx-auto bg-white shadow-md rounded px-8 py-6 ">
        <h2 className="text-xl font-semibold mb-4 text-center">Forgotten Password?</h2>
        <form 
            className="max-w-sm mx-auto bg-white shadow-md rounded px-6 py-6"
            onSubmit={submitForm}
        >
            
            <div className="mb-4">
                <InputLable 
                    lableClassName="block text-sm font-medium leading-6 text-gray-900"
                    lableName="Email ID"
                    inputType={INPUT_TYPE.EMAIL}
                    placeholders="Enter your Email Address"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                    name="email"
                    value={resetPasswordDetails?.email ?? ""}
                    handleInput={ 
                        (event) => setResetPasswordDetails(
                        {
                            ...resetPasswordDetails,
                            email: event.target.value
                        })
                    }
                />
                <InputLable 
                    lableClassName="block text-sm font-medium leading-6 text-gray-900" 
                    lableName="OTP"
                    inputType={INPUT_TYPE.NUMBER}
                    placeholders="Enter OTP"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                    name="otp"
                    value={resetPasswordDetails?.otp}
                    handleInput={ 
                        (event) => setResetPasswordDetails(
                        {
                            ...resetPasswordDetails,
                            otp: event.target.value
                        })
                    }
                    min={0}
                    max={999999}
                />
                <InputLable 
                    lableClassName="block text-gray-700 text-sm font-bold mb-2" 

                    lableName="Password"
                    inputType={INPUT_TYPE.PASSWORD}
                    placeholders="Enter your Password"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                    name="password"
                    value={resetPasswordDetails?.password ?? ""}
                    handleInput={ 
                        (event) => setResetPasswordDetails(
                        {
                            ...resetPasswordDetails,
                            password: event.target.value
                        })
                    }
                />
                <InputLable 
                    lableClassName="block text-gray-700 text-sm font-bold mb-2" 

                    lableName="Confirm your Password"
                    placeholders="Enter Password again"
                    inputType={INPUT_TYPE.PASSWORD}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                    name="password"
                    value={resetPasswordDetails?.cPassword ?? ""}
                    handleInput={ 
                        (event) => setResetPasswordDetails(
                        {
                            ...resetPasswordDetails,
                            cPassword: event.target.value
                        })
                    }
                />
                {cPassMatch?<p className="font-bold text-red-500">{ErrorDisplayMessage.PASSWORD_CPASS_NOT_MATCH}</p>:<></>}
            </div>
            <div className="flex items-center justify-between">
                <button
                    className="text-sm hover:text-sky-500" 
                    onClick={generateOTPRoute}
                >
                    Generate OTP?
                </button>
                <Inputs 
                    inputType={INPUT_TYPE.SUBMIT} 
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-4"
                    name="Forgot Password"
                />
                
            </div>
        </form>
    </div>)
    } catch (error) {
        console.error("Error: On resetPassword", error)
    }
}