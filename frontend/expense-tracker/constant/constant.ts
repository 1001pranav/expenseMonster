import { NAV_ITEMS, NAV_ITEMS_OBJ } from "./interfaces";

export enum INPUT_TYPE {
    "TEXT",
    "NUMBER",
    "PASSWORD",
    "SUBMIT",
    "RESET",
    "EMAIL",
    "RADIO",
    "DL",
    "TEXTAREA",
    "CHECKBOX"
};

export const INPUTS :string[] = [
    "text",
    "number",
    "password",
    "submit",
    "reset",
    "email",
    "radio",
    "date",
    "textarea",
    "checkbox"
];

export const FREQUENCY_TYPE: { [key: string]: string } = {
    "NEVER": "Never",
    "DAY": "Day",
    "WEEK": "Week",
    "MONTH": "Month",
    "QUARTERLY": "Quarterly",
    "HALF-YEARLY": "Half-Yearly",
    "YEARLY": "Yearly",
}

export const NAV_LINKS : NAV_ITEMS_OBJ = {
    HOME: {
        name: "home",
        title: "Home",
        href: "/"
    },
    LOGIN: {
        name: "login",
        title: "Hey user, Enter again",
        href:"/login"
    },
    REGISTER: {
        name: "register",
        title: "Register here",
        href:"/signup"
    },
    DASHBOARD: {
        name: "dashboard",
        title: "Dashboard",
        href:"/"
    },
    BUDGET: {
        name: "budget",
        title: "Your budgets",
        href:"/budget"
    },
    INVESTMENTS: {
        name: "investments",
        title: "Future Plans 😉 (Investments)",
        href:"/investments"
    },
    REPORT: {
        name: "report",
        title: "Reports and analytics",
        href:"/reports"
    },
    LOGOUT: {
        name: "logout",
        title: "Logout",
        href:"/logout"
    }
}

export const INVESTMENT_TYPE: { [key: string]: string } = {
    "STOCK": "Stock",
    "MUTUAL_FUND": "Mutual funds",
    "FD": "FD/RD",
    "GOLD": "Gold",
    "OTHERS": "Others"
} 
export const LOGIN_PATH = "/login";

export enum FREQUENCY {
    "NEVER",
    "DAY", 
    "WEEK",
    "MONTH",
    "HALF-YEARLY",
    "YEARLY",
    "QUARTERLY",
    "OTHERS"
}

export enum INVESTMENTS {
    STOCKS,
    MUTUAL_FUND,
    FD,
    GOLD,
    OTHERS,
}


export const ENV_TYPE = {
    DEV: "DEV",
    PROD: "PROD"
}

export const ENV = ENV_TYPE.DEV; 