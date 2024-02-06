// Layout.tsx
import React, { ReactNode } from 'react';

type LayoutProps = {
    children: ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
    return (
        <div>
        <header>
            <h1>Expenses tracker Application</h1>
        </header>
            <main>{children}</main> 
        </div>
    );
};

export default Layout;