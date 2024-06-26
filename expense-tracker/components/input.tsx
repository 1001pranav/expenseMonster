import { INPUTS } from "@/constant/constant";
import { INPUT_COMPONENT, LABLLED_INPUT, SelectInput, } from "@/constant/interfaces";
import { ReactNode } from "react";

export default function Inputs(inputProps : INPUT_COMPONENT): ReactNode {

    const required = inputProps?.required ? true : false;
    return (
        <input 
            className={inputProps.className} 
            name={inputProps.name} 
            type={INPUTS[inputProps.inputType]}
            placeholder={inputProps.placeholders}
            required={required}
            value={inputProps.value}
            onChange={inputProps.handleInput}
            min={inputProps?.min}
            max={inputProps?.max}
        />
    )
}

export function InputLable(lableInputs: LABLLED_INPUT): ReactNode {
    return (
        <>
            <label className={lableInputs.lableClassName} htmlFor={lableInputs.name}>
                {lableInputs.lableName} 
            </label>
            
            <Inputs 
                className={lableInputs.className} 
                name={lableInputs.name} 
                inputType={lableInputs.inputType}
                placeholders={lableInputs.placeholders}
                value={lableInputs.value}
                handleInput={lableInputs.handleInput}
            />
        </>
    )
}

export function LabelSelectTag({
        selectName, 
        options, 
        formName, 
        className, 
        handleInput
    }: SelectInput 
): ReactNode {
    //selectName: string, options: ReactNode): ReactNode {
    return (
        <>
            <label className="block" htmlFor={formName} >
                <span className="text-gray-700">{selectName}</span>
            </label>
            <select name={formName} onChange={handleInput} className={className}>
                {options}
            </select>
        </>
    )

}

export function OptionWithOptGroup({optName, options}: { optName: string, options: string[] }): ReactNode {
    return( 
        <>
            <optgroup label={optName}>
                {SelectOptions({options})}
            </optgroup>
        </>
    )
}

export function SelectOptions({options}:{options: string[]}): ReactNode {

    return (
        <>
            {options.map((optionName:string, index)=> <option value={optionName} key={index}>{optionName}</option>)}
        </>
    )
}