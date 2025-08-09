import { Avatar, Button, Typography } from "antd";
import React, { useContext } from "react";
import styled from "styled-components";
import { auth } from "../../firebase/config"; // Adjust the import path as necessary
import { AuthContext } from "../../Context/AuthProvider";

const WrapperStyle = styled.div`
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(82, 38, 83);

    .username{
        color: white;
        margin-left: 5px;
    }
`;
export default function UserInfor() {
    const handleLogout = () => {
        // Xử lý đăng xuất ở đây
        console.log("Đăng xuất");
        auth.signOut();
    }
      const { user: {
      displayName, 
      photoURL
    } } = useContext(AuthContext);
    return (
    <WrapperStyle>
      <div>
        <Avatar src={photoURL}>{photoURL ? '' : displayName?.charAt(0)?.toUpperCase()}</Avatar>
        <Typography.Text style={{ color: 'white', marginLeft: '5px' }}>{displayName}</Typography.Text>
      </div>
      <Button ghost style={{borderRadius: '15px', textDecoration: 'bold'}} onClick={handleLogout}>Đăng xuất</Button>
    </WrapperStyle>
  );
} 