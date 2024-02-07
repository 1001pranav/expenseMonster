import React, { ReactNode } from 'react';

import "./global.css"
import {Navigation} from '@/components/navbar';

export default function ExpenseTracker({ Component, pageProps }:{Component: any, pageProps: any}): ReactNode {
    
    return (
        <div>
            <Navigation is_logged={false}/>
            <Component {...pageProps} />
            
        </div>
    )
}
