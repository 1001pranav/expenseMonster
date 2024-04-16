import Dashboard from "@/components/dashboard";
import { VerifyLogin } from "@/services/loginServices";
import { ReactNode, useEffect, useState } from "react";

export default function Home(): ReactNode {
    let isUserLoggedIn :string | boolean = false;
    if (typeof window !== "undefined") {
        isUserLoggedIn = VerifyLogin()
    }

    const [isRendered, setRender] = useState<boolean>(false);
    useEffect(()=> setRender(true))
    return (

        <main className={""}>
            <div className={""}>
                {isUserLoggedIn && isRendered? <Dashboard />: <></>}
            </div>
        </main>
    );
}
