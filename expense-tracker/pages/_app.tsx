import React, { ReactNode } from 'react';

import "./global.css"
import {Navigation} from '@/components/navbar';

export default function ExpenseTracker({ Component, pageProps }:{Component: any, pageProps: any}): ReactNode {
    
    return (
        <div className='max-w-8xl'>
            <Navigation />
            <Component {...pageProps} />
            
        </div>
    )
}
