import { INPUT_TYPE } from "./constant";

export interface INPUT_COMPONENT {
    inputType: INPUT_TYPE; 
    className: string; 
    name: string;
    value?: any;
    handleInput?: (event: any) => any;
    placeholders?: string
    required?: boolean
}

export interface LABLLED_INPUT extends INPUT_COMPONENT {
    lableName: string
    lableClassName: string
}

export interface LOGIN {
    userName: string;
    password: string;
}

export interface LINK_COMPONENT {
    link: string;
    name: string;
    className: string;
}

export interface NAV_COMPONENT {
    is_logged: boolean;
}

export interface NAV_ITEMS {
    name: string;
    title: string;
    href: string;
    active?: boolean;
    subLinks?: NAV_ITEMS[];
}

export interface NAV_ITEMS_OBJ {
    [key: string]: NAV_ITEMS
}

export interface SIGNUP_COMPONENTS {
    username: string;
    password: string;
    cPassword: string;
    email: string;
}

export interface GRAPH_INTERFACE {
    label: string[];
    titleText: string;
    backgroundColor?: string[];
    data: number[];
    id: string;
}

export interface BAR_GRAPH_INTERFACE extends GRAPH_INTERFACE {
    expenseData: number[];
    incomeData: number[];
}

export interface Transaction {
    date: string;
    category: string;
    amount: number;
    type: 'income' | 'expense';
}

export interface TransactionTableProps{
    Transactions: Transaction[];
}