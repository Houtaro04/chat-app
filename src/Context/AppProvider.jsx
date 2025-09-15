// src/Context/AppProvider.jsx
import React, { useContext, useMemo, useState } from "react";
import { AuthContext } from "./AuthProvider";
import useFirestore from "../Hooks/useFirestore";

export const AppContext = React.createContext();

export default function AppProvider({ children }) {
  const [isAddRoomVisible, setIsAddRoomVisible] = useState(false);
  const [isInviteMemberVisible, setIsInviteMemberVisible] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");

  // --- Lấy user an toàn từ Context + fallback JWT ---
  const { user: ctxUser } = useContext(AuthContext) || {};
  const jwtUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("jwt_auth") || "null")?.user || null;
    } catch {
      return null;
    }
  }, []);

  // Chuẩn hoá uid từ nhiều nguồn (ctx / jwt)
  const uid =
    ctxUser?.uid ??
    ctxUser?.id ??
    ctxUser?._id ??
    ctxUser?.username ??
    jwtUser?.uid ??
    jwtUser?.id ??
    jwtUser?._id ??
    jwtUser?.username ??
    null;

  // --- Điều kiện query rooms: chỉ khi đã có uid ---
  const roomsCondition = useMemo(() => {
    if (!uid) return null;
    return {
      fieldName: "members",
      operator: "array-contains",
      compareValue: uid,
    };
  }, [uid]);

  // Lưu ý: useFirestore của bạn nên tự xử lý khi condition = null và trả []
  const rooms = useFirestore("rooms", roomsCondition);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || {},
    [rooms, selectedRoomId]
  );

  // --- Điều kiện query members của phòng hiện tại ---
  const usersCondition = useMemo(() => {
    const mems = selectedRoom?.members || [];
    if (!mems.length) return null;
    return {
      fieldName: "uid",
      operator: "in",
      compareValue: mems,
    };
  }, [selectedRoom?.members]);

  const members = useFirestore("users", usersCondition);

  const clearState = () => {
    setSelectedRoomId("");
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
