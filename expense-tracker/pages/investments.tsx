import { InputLable, LabelSelectTag, SelectOptions } from "@/components/input";
import { FREQUENCY, INPUT_TYPE, INVESTMENTS, FREQUENCY_TYPE, INVESTMENT_TYPE } from "@/constant/constant";
import { AddInvestment } from "@/constant/interfaces";
import { frequencyEnumConverter, investmentEnumConverter } from "@/services/helper";
import { useState } from "react";

export default function () {
    const [isHidden, updateHiddenStatus] = useState<Boolean>(false);
    const [investmentOptions, setInvestmentOptions] = useState<AddInvestment>({
        investmentName: undefined,
        investmentAmount: 0,
        autoPay: false,
        frequency: FREQUENCY.NEVER,
        investmentClosed: false,
        deductions: 0,
        investmentType: INVESTMENTS.STOCKS,
    });
    const frequencyOptionsNames = Object.values(FREQUENCY_TYPE);
    frequencyOptionsNames[0] = "One-time"
    const frequencyOptions: JSX.Element = <SelectOptions options={Object.values(frequencyOptionsNames)}/>
    const investmentOptionsList: JSX.Element = <SelectOptions options={Object.values(INVESTMENT_TYPE)}/>

    try {
        return (
            <div className="m-auto">
                <div className={`flex justify-between p-4 m-4 ${isHidden? 'shadow':'shadow-lg'}`} onClick={()=>updateHiddenStatus(!isHidden)}>
                    <span className="font-bold text-md">Add Investments</span>
                    <button className="right-0">
                        {isHidden ? '▼' : '▲'}
                    </button>
                </div>
                {
                    !isHidden? <form className="mx-5 flex flex-col">
                        <LabelSelectTag 
                            selectName="Investment Type"
                            options={investmentOptionsList}
                            formName="investmentType"
                            className="block appearance-none w-1/2 bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
                            handleInput={(e)=> {
                                setInvestmentOptions({
                                    ...investmentOptions,
                                    investmentType: investmentEnumConverter(e.target.value)
                                })
                            }}
                        />
                        
                        {
                            investmentOptions.investmentType === INVESTMENTS.GOLD? <></> : 
                            <InputLable  
                                lableName= {`Name of the ${
                                    investmentOptions.investmentType === INVESTMENTS.FD ? 'Bank': 
                                        investmentOptions.investmentType === INVESTMENTS.MUTUAL_FUND ? "Mutual Fund": 
                                            investmentOptions.investmentType === INVESTMENTS.STOCKS ? 'Company/Stock' : 'Others'
                                }`}
                                inputType={INPUT_TYPE.TEXT}
                                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2"
                                className="block appearance-none w-1/2 bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
                                name="name"
                                handleInput={(e) => {
                                    setInvestmentOptions({
                                        ...investmentOptions,
                                        investmentName: e.target.value
                                    })
                                }}
                                value={investmentOptions.investmentName}
                            />
                        }
                        <InputLable  
                                lableName= "Amount Invested"
                                inputType={INPUT_TYPE.NUMBER}
                                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2"
                                className="block appearance-none w-1/2 bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
                                name="amount"
                                handleInput={(e) => {
                                    setInvestmentOptions({
                                        ...investmentOptions,
                                        investmentAmount: e.target.value
                                    })
                                }}
                            />
                        <LabelSelectTag 
                            selectName="Investment Frequency"
                            options={frequencyOptions}
                            formName="investmentFrequency"
                            className="block appearance-none w-1/2 bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
                            handleInput={(e)=> {
                                setInvestmentOptions({
                                    ...investmentOptions,
                                    frequency: frequencyEnumConverter(e.target.value)
                                })
                            }}
                        />
                        <div className="flex items-center">
                            <InputLable 
                                lableClassName="block text-sm font-medium leading-6 text-gray-900 p-2 m-2"
                                lableName="Auto Pay?"
                                inputType={INPUT_TYPE.CHECKBOX}
                                name="type"
                                className=""
                                value={true}
                                // handleInput={()}
                            />
                            
                        </div>
                    </form>: <></>
                }
            </div>
        )
    } catch (error) {
        console.error("Error: on Investments",error);
    }
}