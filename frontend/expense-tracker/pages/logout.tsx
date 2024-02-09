import { useRouter } from "next/router"
import { useEffect } from "react";

export default function Logout() {

   // Check if the code is running in a browser environment
    if (typeof window !== "undefined") {
        // If so, clear all key/value pairs from local storage
        localStorage.clear();
    }

    // Get the router object from the useRouter hook
    const router = useRouter();

    // Define a useEffect hook that runs after the component renders
    //This is done as all the local storage data needs to be cleared.
    useEffect(()=> {
        // After the component renders, navigate to the login page
        router.push("/login");
    })

    // Return an empty object, as this component doesn't render any UI
    return <div></div>

}