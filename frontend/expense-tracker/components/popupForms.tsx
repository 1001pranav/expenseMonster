import { Bills, CategoryInput, IncomeExpenseInput, PopupFormsProps, formsForPopUpProps } from "@/constant/interfaces";
import React, { ReactNode, useState } from "react";
import Inputs, {InputLable, OptionWithOptGroup, LabelSelectTag, SelectOptions} from "@/components/input";
import { FREQUENCY_TYPE, INPUT_TYPE } from "@/constant/constant";

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
    >

    <LabelSelectTag 
        formName="categoryType" 
        selectName="Select Categories"
        options={optionsGroup}
        handleInput={(e)=> setIncomeExpense({...incomeExpense, category: e.target.value})}        
        className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
    />
        <InputLable 
        lableName="Amount" 
            inputType={INPUT_TYPE.NUMBER} 
            name="amount" 
            handleInput={(event)=> setIncomeExpense({...incomeExpense, amount: event.target.value})}
            value={incomeExpense.amount}
        
        lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 "
        className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
        />
        <InputLable
            lableName="Date Of Spending or Income"
        inputType={INPUT_TYPE.DL}
            name="date"
            handleInput={(e)=> setIncomeExpense({...incomeExpense, date: e.target.value})}
            value={incomeExpense.date}
        lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 "
        className="block w-1/2 rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"  
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
                name="" 
            />
        </div>
        
    </form>
    return (
            <PopUpForms isOpen={props.isOpen} onClose={props.onClose} Forms={Form}/>
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
            className="space-y-4 flex flex-col" 
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
            <div className="flex items-center justify-center">
                <Inputs 
                    inputType={INPUT_TYPE.SUBMIT} 
                    className="bg-blue-500 w-1/4 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-2"
                    name="" 
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

export function UpdateBills(props: formsForPopUpProps): React.ReactNode {
    const [incomeExpense, setIncomeExpense] = useState<Bills>({
        amount: 0,
        billsID: 0,
        name: "",
        frequencies: "NEVER",
        description: ""
    });
    const formSubmission:(e: any) => void = (e) => {
            console.log(incomeExpense);
            e.preventDefault();
        };
    const options: React.ReactNode = <SelectOptions options={Object.keys(FREQUENCY_TYPE)} />

    const Form: React.ReactNode = <form 
        className="space-y-4 flex flex-col" 
        onSubmit={formSubmission}
    >
        <InputLable 
            lableName="Bill Name" 
            lableClassName="block text-sm font-medium leading-6 text-gray-900"
            inputType={INPUT_TYPE.TEXT} 
            className="block w-1/2 rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"  
            name="amount" 
            handleInput={(event)=> setIncomeExpense({...incomeExpense, name: event.target.value})}
            value={incomeExpense.name}
        />
        <InputLable 
            lableName="Bill Amount" 
            lableClassName="block text-sm font-medium leading-6 text-gray-900"
            inputType={INPUT_TYPE.NUMBER} 
            className="block w-1/2 rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm leading-6"  
            name="amount" 
            handleInput={(event)=> setIncomeExpense({...incomeExpense, amount: event.target.value})}
            value={incomeExpense.amount}
        />
        <LabelSelectTag 
            formName="frequency" 
            className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
            selectName="Frequency of Bill"
            options={options}
            handleInput={(e)=> setIncomeExpense({...incomeExpense, frequencies: e.target.value})}
        />
        <InputLable
            lableClassName="block text-sm font-medium leading-6 text-gray-900"
            lableName="Description"
            className="resize border rounded-md w-full px-3 py-2 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            inputType={INPUT_TYPE.TEXTAREA}
            name="description"
            handleInput={(e)=> setIncomeExpense({...incomeExpense, description: e.target.value})}
            value={incomeExpense.description}
        />
        <div className="flex items-center justify-center">
            <Inputs 
                inputType={INPUT_TYPE.SUBMIT} 
                className="bg-blue-500 w-1/4 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-2"
                name="" 
            />
        </div>
        
    </form>
    return (
        <div>
            <PopUpForms isOpen={props.isOpen} onClose={props.onClose} Forms={Form}/>
        </div>
    )
}