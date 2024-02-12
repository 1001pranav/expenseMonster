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
        />
    )
}

export function InputLable(lableInputs: LABLLED_INPUT): ReactNode {
    return (
        <label className={lableInputs.lableClassName}>
            {lableInputs.lableName}
            <Inputs 
                className={lableInputs.className} 
                name={lableInputs.name} 
                inputType={lableInputs.inputType}
                placeholders={lableInputs.placeholders}
                value={lableInputs.value}
                handleInput={lableInputs.handleInput}
            />
        </label>
    )
}