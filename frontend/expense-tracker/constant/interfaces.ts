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