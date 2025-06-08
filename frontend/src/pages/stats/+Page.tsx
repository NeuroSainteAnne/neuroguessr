import { useApp } from "../../context/AppContext";
import "./Stats.css"

function Stats() {
  const { t } = useApp()
  const placeholder = t("construction_in_progress")
    return(<>
      <title>${t("neuroguessr_stats_title")}</title>
      <div>{placeholder}</div>
    </>)

}

export default Stats;