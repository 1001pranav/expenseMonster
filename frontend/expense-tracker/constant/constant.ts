import { NAV_ITEMS, NAV_ITEMS_OBJ } from "./interfaces";

export enum INPUT_TYPE {
    "TEXT",
    "NUMBER",
    "PASSWORD",
    "SUBMIT",
    "RESET",
    "EMAIL"
};

export const INPUTS :string[] = [
    "text",
    "number",
    "password",
    "submit",
    "reset",
    "email"
];

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
    EXPENSE: {
        name: "expense",
        title: "Expenditure and Expenses",
        href: "/expense"
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

