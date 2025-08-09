import { useContext, useMemo, useState } from "react";
import React from "react";
import { AuthContext } from "./AuthProvider";
import useFirestore from "../Hooks/useFirestore";

export const AppContext = React.createContext();
export default function AppProvider({ children }) {
    const [isAddRoomVisible, setIsAddRoomVisible] = useState(false);
    const [isInviteMemberVisible, setIsInviteMemberVisible] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState('');

    const { user = {} } = useContext(AuthContext);
    const { uid } = user;


    const roomsCondition = useMemo(() => {
        if (!uid) return null;
        return {
        fieldName: 'members',
        operator: 'array-contains',
        compareValue: uid,
        };
    }, [uid]);

    const rooms = useFirestore('rooms', roomsCondition || {});

    const selectedRoom = useMemo(
        () => rooms.find((room) => room.id === selectedRoomId) || {},
        [rooms, selectedRoomId]
    );

    const usersCondition = useMemo(() => {
        if (!selectedRoom.members || selectedRoom.members.length === 0) return null;
        return {
        fieldName: 'uid',
        operator: 'in',
        compareValue: selectedRoom.members,
        };
    }, [selectedRoom.members]);

    const members = useFirestore('users', usersCondition || {});

    const clearState = () => {
        setSelectedRoomId('');
        setIsAddRoomVisible(false);
        setIsInviteMemberVisible(false);
    };

    return (
        <AppContext.Provider
        value={{
            rooms,
            members,
            selectedRoom,
            isAddRoomVisible,
            setIsAddRoomVisible,
            selectedRoomId,
            setSelectedRoomId,
            isInviteMemberVisible,
            setIsInviteMemberVisible,
            clearState,
        }}
        >
        {children}
        </AppContext.Provider>
    );
}
