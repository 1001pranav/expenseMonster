import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";

import { VerifyLogin } from "@/services/loginSerrvices";
import { Links } from "./links";
import { NAV_COMPONENT, NAV_ITEMS, SubNavProps } from "@/constant/interfaces";
import { NAV_LINKS } from "@/constant/constant";

export function Navigation(): ReactNode {
    try {
        const NavBarLinks: NAV_ITEMS[] = [];
        const [isOpen, setIsOpen] = useState<boolean>(false);

        const loginVerification: boolean | string = VerifyLogin();
        
        if (!loginVerification) {
            switch (usePathname()) {
                case "/":
                    NavBarLinks.push({
                            ...NAV_LINKS.HOME,
                            active: true,
                        }, 
                        NAV_LINKS.LOGIN,
                        NAV_LINKS.REGISTER
                    )
                    break;
                case "/login": 
                    NavBarLinks.push(
                        NAV_LINKS.HOME,
                        {
                            ...NAV_LINKS.LOGIN,
                            active: true,
                        },
                        NAV_LINKS.REGISTER
                    );
                    break;
                case "/register":
                    NavBarLinks.push(
                        NAV_LINKS.HOME,
                        NAV_LINKS.LOGIN,
                        {
                            ...NAV_LINKS.REGISTER,
                            active: true
                        }
                    );
                    break;
                default: 
                    NavBarLinks.push(
                        NAV_LINKS.HOME,
                        NAV_LINKS.LOGIN,
                        NAV_LINKS.REGISTER
                    );
            }
        }
        else {
            switch(usePathname()) {
                case "/":
                    NavBarLinks.push(
                        {
                            ...NAV_LINKS.DASHBOARD,
                            active: true
                        },
                        NAV_LINKS.INVESTMENTS,
                        NAV_LINKS.LOGOUT
                    ); 
                    break;
                case "/budget": 
                    NavBarLinks.push(
                        NAV_LINKS.DASHBOARD,
                        NAV_LINKS.INVESTMENTS,
                        NAV_LINKS.LOGOUT
                    );
                    break;
                case "/investments": 
                    NavBarLinks.push(
                        NAV_LINKS.DASHBOARD,
                        {
                            ...NAV_LINKS.INVESTMENTS,
                            active: true
                        },
                        NAV_LINKS.LOGOUT
                    );
                    break;
                case "/reports": 
                    NavBarLinks.push(
                        NAV_LINKS.DASHBOARD,
                        NAV_LINKS.INVESTMENTS,
                        NAV_LINKS.LOGOUT
                    );
                    break;
                case "/logout": 
                    NavBarLinks.push(
                        NAV_LINKS.DASHBOARD,
                        NAV_LINKS.INVESTMENTS,
                        {
                            ...NAV_LINKS.LOGOUT,
                            active: true
                        }
                    );
                    break;
                default: 
                    NavBarLinks.push(
                        NAV_LINKS.DASHBOARD,
                        NAV_LINKS.INVESTMENTS,
                        NAV_LINKS.LOGOUT
                    );
                    break;
            }
        }

        return (
            <nav className="bg-gray-800 py-4 mb-8">
                <div className="mx-auto px-4 flex justify-between items-center">
                    <div className="flex items-center">
                        <h1 className="text-white text-lg font-semibold">Expenses Monster</h1>
                    </div>
                    <div className="hidden md:block">
                        <ul className="flex space-x-6">
                            {NavBarLinks.map((link, index) => (
                            <li key={index} className={link.active ? 'text-white font-bold' : ''}>
                                <a href={link.href} className="text-white hover:text-gray-300 relative">
                                    {link.title}
                                    {link?.subLinks && (
                                        <ul className="absolute top-full left-0 bg-gray-800 p-2 mt-1 rounded shadow-lg hidden">
                                            {link.subLinks.map((subLink, subIndex) => (
                                                <li key={subIndex}>
                                                    <Links 
                                                        link={subLink.href}
                                                        className="text-white hover:text-gray-300"
                                                        name={subLink.title}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </a>
                            </li>
                            ))}
                        </ul>
                    </div>
                    <div className="md:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="text-white hover:text-gray-300 focus:outline-none"
                        >
                            <svg
                            className="h-6 w-6"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            >
                            {isOpen ? (
                                <path d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path d="M4 6h16M4 12h16M4 18h16" />
                            )}
                            </svg>
                        </button>
                    </div>
                    </div>
                    {isOpen && (
                        <div className="md:hidden bg-gray-800">
                            <ul className="flex flex-col space-y-4">
                                {NavBarLinks.map((link, index) => (
                                <li key={index} className={link.active ? 'text-white font-bold' : ''}>
                                    <a href={link.href} className="text-white hover:text-gray-300 relative">
                                    {link.name}
                                    {link?.subLinks && (
                                        <ul className="absolute top-full left-0 bg-gray-800 p-2 mt-1 rounded shadow-lg hidden">
                                        {link.subLinks.map((subLink, subIndex) => (
                                            <li key={subIndex}>
                                            <a href={subLink.href} className="text-white hover:text-gray-300">
                                                {subLink.name}
                                            </a>
                                            </li>
                                        ))}
                                        </ul>
                                    )}
                                    </a>
                                </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </nav>
            ); 

    } catch (error) {
        console.log("Error: on NavBar", error);
        // throw new Error();    
    }
}

export function SubNav({navItems}: SubNavProps): ReactNode {
    try {
        return <div className='max-w-7xl m-auto shadow py-2'>
            <div className="h-auto w-auto flex flex-row p-1 m-1">
                {
                    navItems.map((nav, index) => <div key={index}>
                        <button
                            className="text-black rounded-md hover:font-bold"
                            onClick={()=> {nav.onCloseButton(true)}}
                            key={index}
                        >
                            {nav.title}
                        </button>
                        <span key={index + navItems.length} className='px-1 font-bold'>/</span>
                    </div>)
                }
            </div>
        </div>
    } catch (error) {
        console.log("Error: OnSubNav", error);
    }
}