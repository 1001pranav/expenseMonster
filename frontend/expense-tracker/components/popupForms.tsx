import { CategoryInput, IncomeExpenseInput, PopupFormsProps, formsForPopUpProps } from "@/constant/interfaces";
import React, { ReactNode, useState } from "react";
import Inputs, {InputLable, OptionWithOptGroup, LabelSelectTag, SelectOptions} from "@/components/input";
import { INPUT_TYPE } from "@/constant/constant";

export default function PopUpForms(popupDataProps: PopupFormsProps): React.ReactNode {
    try {
        return (
            <div 
                className={
                    `fixed inset-0 z-20 flex items-center justify-center transition-opacity
                        ${popupDataProps.isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
                }
            >
                <div className="absolute inset-0 bg-black opacity-50"></div>
                <div className="relative bg-white p-8 rounded-lg shadow-lg max-w-lg w-full sm:max-w-xl md:max-w-2xl">
                    <button
                        className="absolute top-0 right-0 m-4 text-gray-500 hover:text-gray-700"
                        onClick={popupDataProps.onClose}
                    >
                        Close
                    </button>
                    {popupDataProps.Forms}
                </div>
            </div>
        );
    } catch (error) {
        console.log("Error: on PopUps", error);
        return
    }
}

export function AddIncomeExpense(props:formsForPopUpProps): React.ReactNode {
    const [incomeExpense, setIncomeExpense] = useState<IncomeExpenseInput>({
        amount: 0,
        category: "",
        date: new Date().toString(),
        type: "Income"
    });
    const formSubmission:(e: any) => void = (e) => {
            console.log(incomeExpense);
            e.preventDefault();
        };
    const optionsGroup: React.ReactNode = <>
        {
            OptionWithOptGroup({optName: "Income", options: ["Salary", "Others"]})
        }{
            OptionWithOptGroup({optName: "Expense", options: ["Food", "Travel"]})
        }
    </>;
    const Form: React.ReactNode = <form 
        className="space-y-4 flex flex-col" 
        onSubmit={formSubmission}
    >
        <InputLable 
            lableName="Expense Amount" 
            lableClassName="block text-sm font-medium leading-6 text-gray-900"
            inputType={INPUT_TYPE.NUMBER} 
            className="block w-1/2 rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"  
            name="amount" 
            handleInput={(event)=> setIncomeExpense({...incomeExpense, amount: event.target.value})}
            value={incomeExpense.amount}
        />
        <InputLable
            lableClassName="block text-sm font-medium leading-6 text-gray-900"
            lableName="Date Of Spending or Income"
            className="block w-1/2 rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"
            inputType={INPUT_TYPE.DTL}
            name="date"
            handleInput={(e)=> setIncomeExpense({...incomeExpense, date: e.target.value})}
            value={incomeExpense.date}
        />
        <label htmlFor="categoryType"> Category of Income/Expense:</label>
        
        <LabelSelectTag 
            formName="categoryType" 
            className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
            selectName="Select Categories"
            options={optionsGroup}
            handleInput={(e)=> setIncomeExpense({...incomeExpense, category: e.target.value})}
        />

        <div className="flex items-center">
            <InputLable 
                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 m-2"
                lableName="Income"
                inputType={INPUT_TYPE.RADIO}
                name="type"
                className="form-radio text-indigo-600 h-5 w-5"
                value={incomeExpense.type}
            />
            <InputLable 
                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 m-auto"
                lableName="Expense"
                inputType={INPUT_TYPE.RADIO}
                name="type"
                className="form-radio text-indigo-600 h-5 w-5 "
                value={incomeExpense.type}
            />
        </div>
        <div className="flex items-center justify-center">
            <Inputs 
                inputType={INPUT_TYPE.SUBMIT} 
                className="bg-blue-500 w-1/4 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-2"
                name="Login" 
            />
        </div>
        
    </form>
    return (
        <div>
            <PopUpForms isOpen={props.isOpen} onClose={props.onClose} Forms={Form}/>
        </div>
    )
}

export function UpdateCategory(props: formsForPopUpProps): React.ReactNode {
    try {
        const [categoryData, setCategory] = useState<CategoryInput>({
            categoryID: 0,
            name: "",
            amount: 0,
            type: "Income"
        });
        
        const formSubmission:(e: any) => void = (e) => {
            console.log(categoryData);
            e.preventDefault();
        };

        const options: ReactNode = <SelectOptions  options={["--New Category--","salary", "Food"]} />
        const Forms: ReactNode = <form
            className="flex flex-col w-full md:w-1/2 mx-auto" 
            onSubmit={formSubmission}
        >
            
            <LabelSelectTag 
                selectName="Category" 
                options={options} 
                formName="category"
                className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
            />
            <InputLable 
                lableName="Category Name"
                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 "
                inputType={INPUT_TYPE.TEXT}
                className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
                value={categoryData.name}
                name="name"
                handleInput={(e)=> setCategory({...categoryData, name: e.target.value})}
            />
            <InputLable 
                lableName="Amount"
                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 "
                inputType={INPUT_TYPE.NUMBER}
                className="block w-1/2 rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"  
                value={categoryData.amount}
                name="name"
                handleInput={(e)=> setCategory({...categoryData, name: e.target.value})}
            />
            <div className="flex items-center w-full">
                <InputLable 
                    lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2"
                    lableName="Income"
                    inputType={INPUT_TYPE.RADIO}
                    name="type"
                    className="form-radio text-indigo-600 h-5 w-5"
                    value={categoryData.type}
                    handleInput={(e)=> setCategory( { ...categoryData, type: 'Income' })}
                />
                <InputLable 
                    lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2"
                    lableName="Expense"
                    inputType={INPUT_TYPE.RADIO}
                    name="type"
                    className="form-radio text-indigo-600 h-5 w-5 "
                    value={categoryData.type}
                    handleInput={(e)=> setCategory( { ...categoryData, type: 'Category' })}

                />
            </div>
        </form>
        return (
            <PopUpForms isOpen={props.isOpen} onClose={props.onClose} Forms={Forms} />
        )
    } catch (error) {
        console.log("Error on updateCategory", error);
        return

    }
}