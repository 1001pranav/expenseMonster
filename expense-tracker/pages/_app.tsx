import React, { ReactNode } from 'react';

import "./global.css"
import {Navigation} from '@/components/navbar';
import { ToastContainer } from 'react-toastify';

export default function ExpenseTracker({ Component, pageProps }:{Component: any, pageProps: any}): ReactNode {

    return (
        <div className='max-w-8xl'>
            <Navigation />
            <ToastContainer  />
            <Component {...pageProps} />
            
        </div>
    )
}
