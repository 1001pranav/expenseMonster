import { TableProps } from "@/constant/interfaces";
import { ReactNode } from "react";

export default function ( props: TableProps) {
    const colNames: string[] = Object.keys(props.data[0]);
    return (
        <table className={props.tableClassName}>
            <caption className={props.captionClassName}>{props.caption}</caption>
            <thead className={props.tHeadClassName}>
                <tr>
                    {
                        props.columnNames.map(
                            (columnName, index) => <th className={props.tHeadClassName} key={index}>
                                {columnName}
                            </th>
                        )
                    }
                </tr>
            </thead>
            <tbody>
                {
                    props.data.map((tData, index) => <tr className={props.tDRowClassName} key={index} onClick={props.rowClick}>
                        {
                            colNames.map(
                                (col) => <>
                                    <td className={props.tDClassName}>
                                        {tData[col]}
                                    </td>
                                </>
                            )
                        }
                    </tr> )
                }
            </tbody>
        </table>
    
    )
}

// function TData({props, tDataClassName}: {props: any[], tDataClassName:string}): ReactNode {
//     let tableData: ReactNode;
//     props.map((tRowData) => {

//         for (let colKeyName in tRowData) {
//             tableData = <td className={}>{tRowData[colKeyName]}</td>
//         }

//     })
//     return <>{tableData}</>;
// }