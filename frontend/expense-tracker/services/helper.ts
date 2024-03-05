import { FREQUENCY, FREQUENCY_TYPE, INVESTMENTS, INVESTMENT_TYPE } from "@/constant/constant";

export function frequencyEnumConverter(frequency: string): number {
    
    switch (frequency) {
        case FREQUENCY_TYPE.NEVER: return FREQUENCY.NEVER;
        case FREQUENCY_TYPE.DAY: return FREQUENCY.DAY;
        case FREQUENCY_TYPE.WEEK: return FREQUENCY.WEEK;
        case FREQUENCY_TYPE.MONTH: return FREQUENCY.MONTH;
        case FREQUENCY_TYPE["HALF-YEARLY"]: return FREQUENCY["HALF-YEARLY"];
        case FREQUENCY_TYPE.YEARLY: return FREQUENCY.YEARLY
        case FREQUENCY_TYPE.QUARTERLY: return FREQUENCY.QUARTERLY
        default: return FREQUENCY.OTHERS;
    }
}

export function investmentEnumConverter(investment: string): number {
    switch(investment) {
        case INVESTMENT_TYPE.STOCK: return INVESTMENTS.STOCKS;
        case INVESTMENT_TYPE.MUTUAL_FUND: return INVESTMENTS.MUTUAL_FUND;
        case INVESTMENT_TYPE.FD: return INVESTMENTS.FD;
        case INVESTMENT_TYPE.GOLD: return INVESTMENTS.GOLD;
        default: return INVESTMENTS.OTHERS;
    }
}