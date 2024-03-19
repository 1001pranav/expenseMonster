import {Dispatch, ReactNode, RefObject, SetStateAction} from "react";
import { FREQUENCY, INPUT_TYPE, INVESTMENTS } from "./constant";
import { ChartType } from "chart.js";
import { LoginResponseData } from "./api";

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
    password: string;
    cPassword: string;
    email: string;
}

export interface GRAPH_INTERFACE {
    graphType: ChartType
    label: string[];
    titleText: string;
    backgroundColor?: string[];
    data: number[];
    id: string;
}

export interface BAR_GRAPH_INTERFACE extends GRAPH_INTERFACE {
    expenseData: number[];
    incomeData: number[];
    incomeBGColor?: string[];
    expenseBGColor?: string[];
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

export interface formsForPopUpProps {
    isOpen: boolean;
    onClose: () => void;
    refObj: RefObject<HTMLDivElement>
    isSubmitted:  Dispatch<SetStateAction<boolean>>;
}

export interface IncomeExpenseInput {
    amount: number;
    category: string;
    date: String;
    type: "Income" | "Expense";
}

export interface SelectInput{
    selectName: string;
    options: ReactNode; 
    formName: string;
    className: string;
    handleInput?: (e: any) => void;
}

export interface PopupFormsProps {
    isOpen: boolean;
    onClose: () => void;
    Forms: ReactNode;
}

export interface CategoryInput {
    categoryID: number;
    name: string;
    amount: number;
    type: "Income" | "Category";
}

export interface CategoryPercentage {
    name: string;
    percentage: number;
}

export interface HorizontalBarProps {
    income: number;
    categories: CategoryPercentage[];
}

export interface CategoryTransaction {
    categoryName: string;
    income: number;
    expense: number;
}

export interface CategoryTransactionProps {
    categories: CategoryTransaction[];
    tableHead: string;
}

export interface Bills {
    billsID: number;
    name: string;
    frequencies: FREQUENCY;
    amount: number;
    description: string;
}

export interface TotalIncomeExpense {
    totalIncome: number;
    totalExpense: number;
}

export interface SubNavItems {
    onCloseButton: (isOpen: boolean) => void;
    title: string;
}
export interface SubNavProps {
    navItems: SubNavItems[]
}

export interface AddFinancialGoal {
    title: string;
    amount: number;
    goalAchieved: 'true' | 'false';
    description: string;
}

export interface FinancialGoals extends AddFinancialGoal {
    id: number;
}

export interface FinancialGoalsTableProps {
    financialGoals: FinancialGoals[];
    setFinancial: Dispatch<SetStateAction<FinancialGoals[]>>
}

export interface TableProps {
    columnNames: string[];
    caption: string;
    tableClassName: string;
    captionClassName: string;
    tDRowClassName: string;
    tHeadClassName: string;
    tDClassName: string;
    data: any[];
    rowClick: ()=>void;
}

export interface IncomeExpenseCard {
    income: number;
    expense: number;
    investment: number;
}

export interface AddInvestment {
    investmentName: string | undefined;
    investmentAmount: number;
    autoPay: boolean;
    frequency: FREQUENCY;
    investmentClosed: boolean;
    deductions: number;
    investmentType: INVESTMENTS,
}

export interface ErrorCard {
    message: string;
}

export interface LoginAPIResponse {
    loginData?: LoginResponseData;
    errorMessage?: string;
    error: boolean
}
