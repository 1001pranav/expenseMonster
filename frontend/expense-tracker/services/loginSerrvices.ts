
export function VerifyLogin(): boolean | string {
    try {
        let accessToken: string | null = null;
        if (typeof window !== "undefined") {
            console.log(typeof window);
            accessToken = localStorage.getItem('access_token');
        }
        // Redirecting to login path as accessToken is not found.
        if ( !accessToken || accessToken.length === 0) {
            return "false";
        }
        return accessToken;
    } catch (error) {
        console.log("Error: accessToken not found", error);
        return false;
    }
}

export function addLogin(accessToken:string): boolean {
    try {
        if (accessToken !== "") {
            localStorage.setItem("access_token", accessToken);
            return true;
        }
        return false;
    } catch (error) {
        console.log("Error on adding accessToken", error);
        return false;
    }
}