import React from "react"
import { Row, Col, Button } from 'antd';
import UserInfor from "./UserInfor";
import RoomList from "./RoomList";
import styled from "styled-components";
import logo from '../../assets/logo.png'


const SidebarStyle = styled.div`
    display: flex;
    background-color: #a3ab6f;
    color: white;
    height: 100%;
    flex-direction: column
`;
export default function Sidebar() {
    return (
        <SidebarStyle>
            <Row style={{height: '100vh'}}>
                <Col span={24} style={{height: '10%', borderBottom: '1px solid rgba(82, 38, 83)'}}>
                    <Button style={{padding: '10px', top: '15px'}} type="text" onClick={() => window.location.assign('/')}>
                        <img src={logo} style={{width: 'auto', height: '50px', display: 'flex', marginRight: "auto", marginLeft: 'auto'}} />
                    </Button>
                </Col>
                <Col span={24} flex="auto" style={{ overflow: "auto",height: '80%' }}><RoomList /></Col>
                <Col span={24} style={{height: '10%'}}><UserInfor /></Col>
            </Row>
        </SidebarStyle>
    );
}