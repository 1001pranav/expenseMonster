import { FinancialGoals, FinancialGoalsTableProps } from '@/constant/interfaces';
import React, { ReactNode, useEffect, useState } from 'react';

    interface Goal {
    id: number;
    title: string;
    description: string;
    amount: number;
    }

// export  FinancialGoalsComponents;
export default function FinancialGoalComponent({financialGoals, setFinancial}: FinancialGoalsTableProps) {  

    const [isDisplayHidden, setDisplayHiddenStatus] = useState<boolean>(false);
    const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]); // State to store selected goal IDs
    const [onGoingGoals, setOnGoingGoals] = useState<JSX.Element[]>([]);
    const [completedGoals, setCompletedGoals] = useState<JSX.Element[]>([]);

    const tHead = (
        <thead>
            <tr>
                <th className='border bg-gray-100 px-4 py-2'>#ID</th>
                <th className='border bg-gray-100 px-4 py-2'>Title</th>
                <th className='border bg-gray-100 px-4 py-2'>Description</th>
                <th className='border bg-gray-100 px-4 py-2'>Amount</th>
            </tr>
        </thead>
    );

    useEffect(()=> {
        // Accumulate goals in temporary arrays
        const tempOnGoingGoals: JSX.Element[] = [];
        const tempCompletedGoals: JSX.Element[] = [];

        financialGoals.forEach((goal, index) => {
            const goalsTable: JSX.Element = (
                <tr key={index} className={selectedGoalIds.includes(goal.id) ? 'bg-blue-200' : ''} onClick={() => toggleGoalSelection(goal.id)}>
                    <td className='border px-4 py-2'>{goal.id}</td>
                    <td className='border px-4 py-2'>{goal.title}</td>
                    <td className='border px-4 py-2 overflow-x-auto'>{goal.description}</td>
                    <td className='border px-4 py-2'>{goal.amount}</td>
                </tr>
            );

            if (goal.goalAchieved === 'true') 
                tempCompletedGoals.push(goalsTable);
            else 
                tempOnGoingGoals.push(goalsTable);
        });

        // Update state arrays once with accumulated values
        setCompletedGoals(tempCompletedGoals);
        setOnGoingGoals(tempOnGoingGoals);
    }, [financialGoals, selectedGoalIds]);

    // Function to toggle selection of a goal
    const toggleGoalSelection = (goalId: number) => {
        if (selectedGoalIds.includes(goalId)) {
            // If the goal ID is already selected, remove it from the array
            setSelectedGoalIds(selectedGoalIds.filter(id => id !== goalId));
        } else {
            // Otherwise, add it to the array
            setSelectedGoalIds([...selectedGoalIds, goalId]);
        }
    };

    const updateFinancialGoals = () => {
        const updatedFinancialGoals = [...financialGoals];
        selectedGoalIds.map(goalsId => {
            const goalIndex = updatedFinancialGoals.findIndex((goal)=> goal.id === goalsId);
            updatedFinancialGoals[goalIndex].goalAchieved = updatedFinancialGoals[goalIndex].goalAchieved === "false" ? "true": "false";
        })
        setFinancial(updatedFinancialGoals);
    }

    return (
        <div className='max-w-7xl m-auto pt-4 mb-8 '>
            <div className={`flex justify-between p-4 m-4 ${isDisplayHidden? 'shadow':'shadow-lg'}`} onClick={()=>setDisplayHiddenStatus(!isDisplayHidden)}>
                <span className='text-left font-bold text-lg'>Financial Goals</span>
                <div className="right-0">
                    <button >
                        {isDisplayHidden ? '▼' : '▲'}
                    </button>
                </div>
            </div>
            {isDisplayHidden ?
                <div className='p-4 m-4 overflow-x-auto shadow-md'>
                    <div className="flex flex-wrap">
                        <div className="w-auto md:w-1/2 px-2">
                            <table className="w-auto">
                                <caption className='font-bold text-lg'>On-Going Financial Goals</caption>
                                {tHead}
                                <tbody>
                                    {onGoingGoals}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="w-auto md:w-1/2 px-2">
                            <table className="w-full">
                                <caption className='font-bold text-lg'>Completed Financial Goals</caption>
                                {tHead}
                                <tbody>
                                    {completedGoals}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="flex justify-center mt-4">
                        <button className='' onClick={updateFinancialGoals}>Click Me</button>
                    </div>
                </div>: 
                <div></div>
            }

        </div>
    )
}