import { LINK_COMPONENT } from "@/constant/interfaces";
import { ReactNode } from "react";

export function Links(linkProps: LINK_COMPONENT): ReactNode {
    try {
        return <a href={linkProps.link} className={linkProps.className}>
            {linkProps.name}
        </a>
    } catch (error) {
        console.log("Error: Links Error", error)
        throw new Error();
    }
}