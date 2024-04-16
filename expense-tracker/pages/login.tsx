import Inputs, {InputLable} from "@/components/input";
import {INPUT_TYPE} from "@/constant/constant";
import {LOGIN} from "@/constant/interfaces";
import { login } from "@/services/apiServices";
import { addLogin } from "@/services/loginServices";

import {FormEvent, useState} from "react";
import { useRouter } from "next/router";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default  function Login() {
    try {
        const router = useRouter();
        const [userDetails, setUserDetails] = useState<LOGIN>({
            userName: "",
            password: ""
        });

        // Defining a function named submitingForm that handles form submission
        const submittingForm: (event: FormEvent<HTMLFormElement>) => void = async (event) => {
            // Preventing the default form submission behavior
            event.preventDefault();

            if (!userDetails.userName ||  !/\S+@\S+\.\S+/.test(userDetails.userName)) {
                toast.warning("Hey buddy 👋, Can you please enter a valid email as we need to make sure you are part of this application 😘, If you want to try this application please register");
                return
            }

            if (!userDetails.password || userDetails.password === "" ) {
                toast.warn(`Are you really ${userDetails.userName} 🤔🙄? Then enter proper password 🤫 please don't leave it blank buddy `);
                return
            }

            const loginResponse = await login({
                email: userDetails.userName,
                password: userDetails.password
            });

            if (loginResponse.error) {
                toast.error(loginResponse.errorMessage);
            } else {
                const accessToken = loginResponse?.loginData?.access_token ?? "";
                const tokenAdded = addLogin(accessToken);
                if (tokenAdded)
                    router.push("/")
            }
            console.log(loginResponse);
        }
        
        return (
            <form 
                // Setting the maximum width of the form to be 576px and centering it
                className="max-w-sm mx-auto bg-white shadow-md rounded px-6 py-6 t-auto"
                // Attaching the submittingForm function as the onSubmit event handler for the form
                onSubmit={submittingForm}
            >   

                <h3 
                    // Setting the text of the h3 element to be "Login form"
                    className="text-xl font-semibold mb-4 text-center"
                >
                    Login form
                </h3>

                {/* Rendering an InputLable component for the username input field */}
                <InputLable 
                    lableName="Username" 
                    inputType={INPUT_TYPE.TEXT} 
                    className="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"  
                    name="username" 
                    handleInput={(event)=> setUserDetails({...userDetails, userName: event.target.value})}
                    lableClassName="block text-sm font-medium leading-6 text-gray-900"
                    // value={userDetails.userName}
                />

                {/* Rendering an InputLable component for the password input field */}
                <InputLable 
                    lableName="Password" 
                    inputType={INPUT_TYPE.PASSWORD} 
                    className="block w-full rounded-md border-0 px-3 py-2  text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6" 
                    name="password" 
                    handleInput={(event)=> setUserDetails({...userDetails, password: event.target.value})}
                    lableClassName="block text-sm font-medium leading-6 text-gray-900"
                    // value={userDetails.password}
                />

                {/* Rendering an Inputs component for the submit button */}
                <div className="flex justify-between py-4">
                    <Inputs 
                        inputType={INPUT_TYPE.SUBMIT} 
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded focus:outline-none focus:shadow-outline mt-2"
                        name="Login" 
                    />
                    <button className="text-sm hover:text-sky-500" onClick={() => {router.push('/forgot-password')}}>
                        Forgot Password?
                    </button>
                </div>
            </form>
        )
    } catch (error) {
        console.log("Error: Login went wrong", error);
    }
}