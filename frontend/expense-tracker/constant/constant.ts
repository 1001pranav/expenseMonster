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
];

export const FREQUENCY_TYPE: {} = {
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

export const LOGIN_PATH = "/login";

export enum FREQUENCY {
    "NEVER",
    "DAY", 
    "WEEK",
    "MONTH",
    "YEAR",
    "HALF-YEARLY",
    "YEARLY",
    "QUARTERLY",
    "OTHERS"
}