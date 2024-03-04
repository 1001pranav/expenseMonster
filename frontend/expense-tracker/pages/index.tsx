import Dashboard from "@/components/dashboard";
import { VerifyLogin } from "@/services/loginSerrvices";
import { ReactNode } from "react";

export default function Home(): ReactNode {
    const isUserLoggedIn =  VerifyLogin(); 
    return (

        <main className={""}>
            <div className={""}>
                
                {isUserLoggedIn? <Dashboard />: <></>}
            </div>
        </main>
    );
}
