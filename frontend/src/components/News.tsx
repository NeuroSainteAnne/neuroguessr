import { navigate } from "vike/client/router";
import { useApp } from "../context/AppContext";
import "./News.css";

export interface NewsItem {
    id: string;
    content: string;
    type?: "info" | "warning" | "announcement" | "update";
    target?: string
}

const News = () => {
    const { t } = useApp();
    
    // Example news items - these could come from props or API
    const newsItems: NewsItem[] = [
        {
            id: "1",
            content: t("news_1_added_info"),
            type: "announcement",
            target: "/singleplayer/navigation/harvard-oxford/7"
        }
    ];

    const handleNewsClick = (target?: string) => {
        if (target) {
            // Check if it's an external URL (starts with http:// or https://)
            if (target.startsWith('http://') || target.startsWith('https://')) {
                window.open(target, '_blank', 'noopener,noreferrer');
            } else {
                // Internal navigation
                navigate(target);
            }
        }
    };

    const getTypeIcon = (type?: string) => {
        switch(type) {
            case "warning": return "⚠️";
            case "announcement": return "📢";
            case "update": return "🔄";
            default: return "ℹ️";
        }
    };

    const getTypeClass = (type?: string) => {
        return type ? `news-item-${type}` : "news-item-info";
    };

    return (
        <div className="news-container">
            <div className="news-items">
                {newsItems.length === 0 ? (
                    <div className="news-empty">{t("news_no_news")}</div>
                ) : (
                    newsItems.map((item) => (
                        <div 
                            key={item.id} 
                            className={`news-item ${getTypeClass(item.type)} ${item.target ? 'news-item-clickable' : ''}`}
                            onClick={() => handleNewsClick(item.target)}
                            style={{ cursor: item.target ? 'pointer' : 'default' }}
                        >
                           <span className="news-item-icon">{getTypeIcon(item.type)}</span>
                           <span className="news-item-content">{item.content}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default News;