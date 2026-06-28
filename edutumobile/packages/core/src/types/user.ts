// Shared interfaces
export interface User {
    id: string;
    email: string;
}

export interface Profile {
    user_id: string;
    email: string;
    full_name: string;
    age?: number;
    school?: string;
    major?: string;
    cgpa?: number;
    grad_year?: number;
    country?: string;
    role: string;
    credits: number;
}
