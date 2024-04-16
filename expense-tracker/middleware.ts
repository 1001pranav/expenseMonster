import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { VerifyLogin } from './services/loginServices'


export function middleware(request: NextRequest) {

    const isLoggedIn: boolean = VerifyLogin();
    if (isLoggedIn) {
        return NextResponse.redirect(new URL(request.nextUrl.pathname, request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
    matcher: ['/investments']
}