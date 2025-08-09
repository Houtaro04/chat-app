import React from "react";
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config'; // Adjust the import path as necessary
import { Spin } from 'antd';
import { useEffect, useState } from "react";

export const AuthContext = React.createContext();
export default function AuthProvider({ children }) {
    const [user, setUser] = useState();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            console.log({ user });
            if (user) {
                const { displayName, email, uid, photoURL } = user;
                setUser({
                    displayName,
                    email,
                    uid,
                    photoURL
                });
                setIsLoading(false);
                navigate('/'); // Authenticated
            } else {
                setIsLoading(false);
                navigate('/login'); // Not authenticated
            }
        });
        return () => unsubscribe();
    }, [navigate]);
    return (
        <AuthContext.Provider value={{ user }}>
            {isLoading ? <Spin /> : children}
        </AuthContext.Provider>
        );
}
