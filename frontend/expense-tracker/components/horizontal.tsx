import { CategoryPercentage, HorizontalBarProps } from "@/constant/interfaces";
import { ReactNode, useEffect, useState } from "react";

export function IncomeExpenseHorizontalBars(incomeExpenseProps: HorizontalBarProps) {

    // Calculate the total percentage of expenses
    const totalPercentage = incomeExpenseProps.categories.reduce((acc, category) => acc + category.percentage, 0);

    // Calculate the remaining percentage for the green bar
    const remainingPercentage = Math.max(100 - totalPercentage, 0);
    
    return (
        <div className="bg-gray-200 p-8">
            <div className="relative">
                <div className="w-full h-20 rounded-lg overflow-hidden flex">
                
                {/* Red bars for expenses */}
                    {incomeExpenseProps.categories.map((category, index) => (
                        <div
                            key={index}
                            className="flex-1 bg-red-500 relative"
                            style={{ width: category.percentage }}
                        >
                        {/* Category label */}
                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs p-1 rounded whitespace-nowrap">
                                {category.name}: {category.percentage} 
                            </div>
                        </div>
                    ))}

                {/* Green bar for income */}
                {remainingPercentage > 0 && (
                    <div className="flex-1  bottom-0 bg-green-500 text-xs p-1 rounded" style={{ width: `${remainingPercentage}%` }}></div>
                )}

                </div>
            </div>
        </div>
    );
};
        

export default function HorizontalBar(props: HorizontalBarProps): ReactNode {
    // Calculate the total percentage of expenses
    const totalPercentage = props.categories.reduce((acc, category) => acc + category.percentage, 0);

    // Calculate the remaining percentage for the green bar
    const remainingPercentage = Math.max(100 - totalPercentage, 0);
    
    return (
        <div>
            <div className="flex flex-row bg-grey-200 p-8 m-auto h-12 w-full ">
                
                {
                    props.categories.map((categories, index) => 
                        <div 
                            key={index} 
                            className="flex justify-items-center justify-center bg-red-500 h-12 font-bold text-sm" 
                            style={{width: `${categories.percentage}%`}}
                        > 
                            <span className="flex-wrap overflow-x-auto">
                                {categories.name}: {categories.percentage}%
                            </span>
                        </div>
                    )
                }
                <div 
                    className="flex justify-items-center justify-center bg-green-500 h-12 font-bold text-sm" 
                    style={{width: `${remainingPercentage}%`}}
                >
                    <span className="flex-wrap overflow-x-auto">Income: {remainingPercentage}%</span>
                </div>
            </div>
            
        </div>
    )
}

//