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
        link: "/"
    },
    LOGIN: {
        name: "login",
        title: "Hey user, Enter again",
        link:"/login"
    },
    REGISTER: {
        name: "register",
        title: "Register here",
        link:"/signup"
    },
    DASHBOARD: {
        name: "dashboard",
        title: "Dashboard",
        link:"/"
    },
    EXPENSE: {
        name: "expense",
        title: "Expenditure and Expenses",
        link:"/expense"
    },
    BUDGET: {
        name: "budget",
        title: "Your budgets",
        link:"/budget"
    },
    INVESTMENTS: {
        name: "investments",
        title: "Future Plans 😉 (Investments)",
        link:"/investments"
    },
    REPORT: {
        name: "report",
        title: "Reports and analytics",
        link:"/reports"
    }
}
export const LOGIN_PATH = "/login";