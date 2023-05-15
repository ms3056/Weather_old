// Importing necessary libraries from 'obsidian'
import { App, ItemView, WorkspaceLeaf, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';

interface Condition {
    text: string;
    icon: string;
}

interface AirQuality {
    co: number;
    no2: number;
    o3: number;
    so2: number;
    pm2_5: number;
    pm10: number;
    "us-epa-index": number;
    "gb-defra-index": number;
}

interface Current {
    temp_c: number;
    condition: Condition;
    wind_kph: number;
    humidity: number;
    uv: number;
    air_quality: AirQuality;
}

interface Location {
    name: string;
    region: string;
    country: string;
    localtime: string;
}

interface WeatherAPIResponse {
    current: Current;
    location: Location;
}

interface WeatherPluginSettings {
    location: string;
    apiKey: string;
    refreshRate: number; // new setting for refresh rate in minutes
}

const DEFAULT_SETTINGS: WeatherPluginSettings = {
    location: '',
    apiKey: '',
    refreshRate: 30,  // default refresh rate is 30 minutes
};

class WeatherView extends ItemView {
    plugin: ObsidianWeatherPlugin;
    contentEl: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianWeatherPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.contentEl = this.containerEl.createDiv();


        // Refresh the weather when the view is created
        this.plugin.refreshWeather();
    }

    getViewType(): string {
        return 'WeatherView';
    }

    getDisplayText(): string {
        return 'Obsidian Weather';
    }

    getIcon(): string {
        return 'cloud-sun'; // Or whatever icon you want to use
    }

    setContent(html: string) {
        this.contentEl.innerHTML = html;
    }
}

export default class ObsidianWeatherPlugin extends Plugin {
    settings: WeatherPluginSettings;
    refreshTimer: NodeJS.Timeout | null = null; // timer for scheduling refreshes


    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        this.addSettingTab(new WeatherSettingTab(this.app, this));


        this.registerView('WeatherView', (leaf: WorkspaceLeaf) => {
            const view = new WeatherView(leaf, this);
            this.refreshWeather(); // refresh weather when the plugin first starts
            return view;
        });

        this.addCommand({
            id: 'open-weather',
            name: 'Open Weather',
            callback: () => {
                this.app.workspace.getRightLeaf(false).setViewState({
                    type: 'WeatherView',
                });
            },
        });

        this.addCommand({
            id: 'refresh-weather',
            name: 'Refresh Weather',
            callback: () => {
                this.refreshWeather(); // call refreshWeather on the plugin instance, not the view
            },
        });
    }

    async refreshWeather() {
        if (!this.settings.apiKey || !this.settings.location) return;

        const url = `http://api.weatherapi.com/v1/current.json?key=${this.settings.apiKey}&q=${this.settings.location}&aqi=yes`;
        const response = await fetch(url);
        const data: WeatherAPIResponse = await response.json();

        const weatherHTML = this.createWeatherHTML(data);
        this.updateWeatherLeaf(weatherHTML);

        // Schedule the next refresh
        this.scheduleRefresh();
    }

    scheduleRefresh() {
        // Clear the previous timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Schedule a new timer
        this.refreshTimer = setTimeout(() => this.refreshWeather(), this.settings.refreshRate * 60 * 1000);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Schedule a refresh when the settings are loaded
        this.scheduleRefresh();
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // Schedule a refresh when the settings are saved
        this.scheduleRefresh();
    }

    createWeatherHTML(data: WeatherAPIResponse): string {
        const { current, location } = data;
        const { condition } = current;

        return `
    <h2>${location.name}, ${location.region}, ${location.country}</h2>
    <div class="weather-main">
        <img src="http:${condition.icon}" alt="${condition.text}" />
        <div class="weather-temp">${current.temp_c}°C</div>
    </div>
    <div class="weather-details">
        <div>
            <span>Wind: ${current.wind_kph} kph</span>
        </div>
        <div>
            <span>Humidity: ${current.humidity}%</span>
        </div>
        <div>
            <span>UV Index: ${current.uv}</span>
        </div>
        <div>
            <span>Air Quality (CO): ${current.air_quality.co}</span>
        </div>
        <div>
            <span>Air Quality (NO2): ${current.air_quality.no2}</span>
        </div>
        <div>
            <span>Air Quality (O3): ${current.air_quality.o3}</span>
        </div>
        <div>
            <span>Air Quality (SO2): ${current.air_quality.so2}</span>
        </div>
        <div>
            <span>Air Quality (PM2.5): ${current.air_quality.pm2_5}</span>
        </div>
        <div>
            <span>Air Quality (PM10): ${current.air_quality.pm10}</span>
        </div>
    </div>
    <div class="weather-condition">${condition.text}</div>
    <div class="local-time">Local Time: ${location.localtime}</div>
    `;
    }


    // Function to update the weather leaf
    updateWeatherLeaf(weatherHTML: string) {
        const leaves = this.app.workspace.getLeavesOfType('WeatherView');
        if (leaves.length) {
            const view = leaves[0].view as WeatherView;
            view.setContent(weatherHTML);
        }
    }

    async onunload() {
        await this.saveData(this.settings);
    }

}

class WeatherSettingTab extends PluginSettingTab {
    plugin: ObsidianWeatherPlugin;
   
    constructor(app: App, plugin: ObsidianWeatherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Location')
            .setDesc('Set your location')
            .addText(text => text
                .setPlaceholder('Enter your location')
                .setValue(this.plugin.settings.location)
                .onChange(async (value) => {
                    this.plugin.settings.location = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Set your OpenWeatherMap API Key')
            .addText(text => text
                .setPlaceholder('Enter your API Key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Refresh Rate')
            .setDesc('Set the refresh rate in minutes')
            .addText(text => text
                .setPlaceholder('Enter the refresh rate')
                .setValue(this.plugin.settings.refreshRate.toString())
                .onChange(async (value) => {
                    this.plugin.settings.refreshRate = Number(value);
                    await this.plugin.saveSettings();
                }));
    }
}

