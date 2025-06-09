import React, { useState } from 'react';
import './Tabs.css';

interface TabProps {
  eventKey: string;
  title: string;
  children: React.ReactNode;
}

interface TabsProps {
  defaultActiveKey: string;
  children: React.ReactElement<TabProps>[];
}

export const Tab: React.FC<TabProps> = ({ children }) => {
  return <>{children}</>;
};

export const Tabs: React.FC<TabsProps> = ({ defaultActiveKey, children }) => {
  const [activeKey, setActiveKey] = useState(defaultActiveKey);
  
  return (
    <div className="custom-tabs">
      <div className="tabs-nav">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return (
              <button
                className={`tab-button ${activeKey === child.props.eventKey ? 'active' : ''}`}
                onClick={() => setActiveKey(child.props.eventKey)}
              >
                {child.props.title}
              </button>
            );
          }
          return null;
        })}
      </div>
      <div className="tab-content">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.props.eventKey === activeKey) {
            return child;
          }
          return null;
        })}
      </div>
    </div>
  );
};