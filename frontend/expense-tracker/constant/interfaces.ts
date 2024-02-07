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
    link: string;
    active?: boolean;
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