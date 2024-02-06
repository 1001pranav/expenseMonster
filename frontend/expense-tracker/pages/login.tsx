import Inputs, {InputLable} from "@/components/input"
import { INPUT_TYPE } from "@/constant/constant"
import { LOGIN } from "@/constant/interfaces"

import loginStyles from "@/pages/css/login.module.css"
import { useState } from "react"

export default function Login() {
    try {
        const [ userDetails, setUserDetails ] = useState<LOGIN>({
            userName: "",
            password: ""
        });
        const submitingForm = (event: any) => {
            event.preventDefault();
            console.log(userDetails);
        }
        
        return (
            <form className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm" onSubmit={submitingForm}>
                <h3>Login form</h3>
                <InputLable 
                    lableName="Username" 
                    inputType={INPUT_TYPE.TEXT} 
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"  
                    name="username" 
                    handleInput={(event)=> setUserDetails({...userDetails, userName: event.target.value})}
                    lableClassName="block text-sm font-medium leading-6 text-gray-900"
                    value={userDetails.userName}
                />
                <InputLable 
                    lableName="Password" 
                    inputType={INPUT_TYPE.PASSWORD} 
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" 
                    name="password" 
                    handleInput={(event)=> setUserDetails({...userDetails, password: event.target.value})}
                    lableClassName="block text-sm font-medium leading-6 text-gray-900"
                    value={userDetails.password}
                />
                <Inputs inputType={INPUT_TYPE.SUBMIT} className="" name="Login" />
            </form>
        )
    } catch (error) {
        console.log("Error: Login went wrong", error);
        throw new Error();
    }
}