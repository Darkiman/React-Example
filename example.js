import React from 'react';
import {Col, Grid, Row} from 'react-flexbox-grid';
import {Dropdown, Icon} from 'semantic-ui-react';
import {inject, observer} from "mobx-react";
import {reaction, computed} from "mobx";
import {
    CartesianGrid,
    Cell,
    Label,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ReferenceArea,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import {FormGroup, Menu, MenuItem, Popover, Position} from '@blueprintjs/core';
import {COMMON_FUNCTIONS} from '../../constants/commonFunctions';
import ReactTable from 'react-table';
import moment from "moment";
import styles from './Dq-kpi.module.scss';
import Preloader from "../preloader/Preloader";
import TablePagination from "../table-pagingation/TablePagination";
import i18nService from "../../utils/i18n/i18nService";


const PIE_CHART_WIDTH = 440;
const PIE_CHART_HEIGHT = 360;

const CustomizedLabel = ({x, y, value, midAngle}) => {
    switch (true) {
        case midAngle < 68:
            break;
        case midAngle < 112:
            y -= 20;
            break;
        case midAngle < 158:
            y -= 20;
            x -= 20;
            break;
        case midAngle < 203:
            x -= 40;
            break;
        case midAngle < 247:
            y += 20;
            x -= 30;
            break;
        case midAngle < 292:
            y += 15;
            break;
    }

    return value > 0
        ? <text
            x={x}
            y={y}
            fontSize={24}
            fill='#000'>{value}%</text>
        : null;
};

const PERIODS = {
    LAST_YEAR: i18nService.t('last_year'),
    LAST_MONTH: i18nService.t('last_month'),
    LAST_WEEK: i18nService.t('last_week')
};


@inject('rootStore') @observer
export default class Kpi extends React.Component {
    acceptanceLevel = ['100-95%', '94-90%', '89-80%', '<80%'];
    acceptanceLevelData = [[100, 95], [95, 90], [90, 80], [80, 0]];

    constructor(props) {
        super(props);
        this.dateFormat = 'DD.MM.YYYY';
        this.chartYearFormat = 'MMM YY';
        this.chartDateFormat = 'DD.MM';
        this.store = this.props.rootStore.dqKpiStore;

        this.state = {
            chartSelections: {},
            selectedDimensions: 'All',
            selectedPolicy: 'All',
            selectedDataSource: [],
            dataSourceOptions: [],
            selectedPeriod: this.store.period[2],
            allChartData: '',
            chartData: '',
            actualVsKpiTargetColumns: [],
            filter: ''
        };

        reaction(
            () => JSON.stringify(this.store.jobResult),
            (_, reactionOnDataLoaded) => {
                let dataSourceOptions = this.getDataSourcesByDimensionsAndPolicies('All', 'All');
                let dataSourceValues = dataSourceOptions.map(item => item.value);
                this.setState({
                    chartSelections: {},
                    selectedDimensions: 'All',
                    selectedPolicy: 'All',
                    selectedDataSource: dataSourceValues,
                    dataSourceOptions: dataSourceOptions,
                    selectedPeriod: this.store.period[2],
                    allChartData: '',
                    chartData: '',
                    actualVsKpiTargetColumns: [],
                    filter: '',
                });
                reactionOnDataLoaded.dispose();
            }
        );

        this.getActualVsKPIColumns();
    }

    getActualVsKPIColumns() {
        const {selectedDataSource} = this.state;
        const result = [
            {
                Header: i18nService.t('dimensions'),
                accessor: 'dimensions',
                // Cell: props => <a>{props.value}</a>
            },
            {
                Header: i18nService.t('lowest'),
                accessor: 'lowest',
                Cell: props => <b>{props.value}%</b>
            },
            {
                Header: i18nService.t('target'),
                accessor: 'target',
                Cell: props => <b>{props.value}%</b>
            }
        ];
        if (selectedDataSource && selectedDataSource.length > 0) {
            const dynamicColumns = selectedDataSource.map(item => {
                return {
                    Header: item,
                    accessor: item,
                    Cell: props => <b
                        className={props.value < props.row.target ? styles.redColor : ''}>{props.value ? props.value + '%' : ''}</b>
                }
            });
            result.splice(1, 0, ...dynamicColumns);
        }
        return result;
    }

    getPIEData() {
        let filtered = this.getFilteredDataForActualVsKpi();
        let result = [];

        for (let i = 0; i < 4; i++) {
            const value = +(filtered.filter(({Failed}) =>
                (100 - parseFloat(Failed) * 100) <= this.acceptanceLevelData[i][0] &&
                (100 - parseFloat(Failed) * 100) > this.acceptanceLevelData[i][1]
            ).length / filtered.length * 100).toFixed(1);

            result.push({value});
        }

        return result;
    }

    getActualVsKPIData() {
        let filtered = this.getFilteredDataForActualVsKpi();

        let result = this.calculateDataForDimensions(filtered);

        this.setLowestAndTargetValue(result);

        result.sort(this.compareDimensions);

        return result;
    }

    getFilteredDataForActualVsKpi() {
        let result = [];

        if (this.state.selectedDataSource && this.state.selectedDataSource.length > 0) {
            for (const row of this.store.jobResult) {
                if (this.usingDimensions.includes(row['Dimension']) && this.usingPolicies.includes(row['Policy']) &&
                    this.state.selectedDataSource.includes(row['Data Source']) && this.startDateFromPeriod.isBefore(moment(row['Date'], this.dateFormat))) {
                    result.push(row);
                }
            }
        }
        return result;
    }

    calculateDataForDimensions(data) {
        let result = [];
        const groupedByDimensions = COMMON_FUNCTIONS.groupBy(data, item => item['Dimension']);
        groupedByDimensions.forEach((value, key) => {
            const groupedByDataSource = COMMON_FUNCTIONS.groupBy(value, d => d['Data Source']);
            let row = {dimensions: key};
            groupedByDataSource.forEach((dataSource, data) => {
                if (!row[data]) {
                    row[data] = 0;
                }
                dataSource.forEach(d => row[data] += parseFloat(d['Failed']));
                row[data] = row[data] / dataSource.length;
                row[data] = parseInt(Math.abs(100 - row[data] * 100));
            });

            result.push(row);
        });
        return result;
    }

    setLowestAndTargetValue(data) {
        for (let item of data) {
            let min = 100;
            for (let key of Object.keys(item)) {
                if (key !== 'dimensions') {
                    if (item[key] < min) {
                        min = item[key];
                    }
                }
            }
            item.lowest = min;
            // calculate real value here
            item.target = this.getTargetByDimension(item.dimensions);
        }
    }

    compareDimensions(a, b) {
        if (a.dimensions < b.dimensions)
            return -1;
        if (a.dimensions > b.dimensions)
            return 1;
        return 0;
    }

    onDimensionsChange = (e, data) => {
        if (data.value) {
            let dataSourceOptions = this.getDataSourcesByDimensionsAndPolicies(data.value, this.state.selectedPolicy);
            this.setState({
                selectedDimensions: data.value,
                dataSourceOptions: dataSourceOptions,
                selectedDataSource: dataSourceOptions.map(item => {
                    return item.value;
                }),
                chartSelections: {}
            })
        }
    };

    onPolicyChange = (e, data) => {
        if (data.value) {
            let dataSourceOptions = this.getDataSourcesByDimensionsAndPolicies(this.state.selectedDimensions, data.value);
            this.setState({
                selectedPolicy: data.value,
                dataSourceOptions: dataSourceOptions,
                selectedDataSource: dataSourceOptions.map(item => {
                    return item.value;
                }),
                chartSelections: {}
            })
        }
    };

    onDataSourceChange = (e, data) => {
        if (data.value) {
            this.setState({
                selectedDataSource: data.value,
                chartSelections: {}
            });
        }
    };

    onPeriodChange = (e, data) => {
        if (data.value) {
            this.setState({
                selectedPeriod: data.value,
                chartSelections: {}
            })
        }
    };

    onHideChart(title) {
        if (title) {
            const selected = this.state.selectedDataSource;
            let index = selected.findIndex(t => t === title);
            selected.splice(index, 1);
            this.setState({selectedDataSource: selected});
        }
    }

    getDataSourcesByDimensionsAndPolicies(selectedDimension, selectedPolicy) {
        let result = [];
        if (!this.store.jobResult || !this.store.jobResult[0]) {
            return result;
        }
        if (selectedDimension === 'All' && selectedPolicy === 'All') {
            for (let row of this.store.jobResult) {
                result.push(row['Data Source']);
            }
        } else if (selectedDimension === 'All' && selectedPolicy !== 'All') {
            for (let row of this.store.jobResult) {
                if (row['Policy'] === selectedPolicy) {
                    result.push(row['Data Source']);
                }
            }
        } else if (selectedDimension !== 'All' && selectedPolicy == 'All') {
            for (let row of this.store.jobResult) {
                if (row['Dimension'] === selectedDimension) {
                    result.push(row['Data Source']);
                }
            }
        } else if (selectedDimension !== 'All' && selectedPolicy !== 'All') {
            for (let row of this.store.jobResult) {
                if (row['Dimension'] === selectedDimension && row['Policy'] === selectedPolicy) {
                    result.push(row['Data Source']);
                }
            }
        }
        result = Array.from(new Set(result));
        return result.map(item => ({
            key: item,
            text: item,
            value: item
        }));
    }

    getChartData() {
        const result = [];
        if (this.state.selectedDataSource) {
            const job = this.store.jobResult;
            this.state.selectedDataSource.map(item => {
                let data = job.filter(row => this.usingDimensions.includes(row['Dimension']) && this.usingPolicies.includes(row['Policy']) &&
                    row['Data Source'] === item && this.startDateFromPeriod.isBefore(moment(row['Date'], this.dateFormat)));
                if (data && data.length > 0) {
                    result.push({title: item, data: data});
                }
            })
        }

        // group by date
        result.forEach(chart => {
            let groupedByDate = COMMON_FUNCTIONS.groupBy(chart.data, item => item['Date']);
            chart.grouped = [];
            groupedByDate.forEach((groupedByDateData, date) => {
                let data = {};
                let groupedByDimension = COMMON_FUNCTIONS.groupBy(groupedByDateData, item => item['Dimension']);
                groupedByDimension.forEach((dimensionsData, dimensionKey) => {
                    let sum = 0;
                    for (let row of dimensionsData) {
                        sum += parseFloat(row['Failed']);
                    }
                    const value = parseInt(Math.abs(100 - (sum / dimensionsData.length) * 100));
                    data[dimensionKey] = value;
                });
                data.Date = date;
                chart.grouped.push(data);
            })
        });
        // group by months
        if (this.state.selectedPeriod === PERIODS.LAST_YEAR) {
            result.forEach(chart => {
                let groupedByMonth = COMMON_FUNCTIONS.groupBy(chart.grouped, item => moment(item['Date'], this.dateFormat).format(this.chartYearFormat));
                chart.grouped = [];
                groupedByMonth.forEach((monthData, month) => {
                    let data = {};
                    for (let row of monthData) {
                        for (let property of Object.keys(row)) {
                            if (property === 'Date') {
                                continue;
                            }
                            if (data[property]) {
                                data[property] += parseFloat(row[property]);
                            } else {
                                data[property] = 0 + parseFloat(row[property]);
                            }
                        }
                    }
                    for (let prop in data) {
                        data[prop] = parseInt(Math.abs((data[prop] / monthData.length)));
                    }
                    // const value = parseInt(Math.abs(sum / monthData.length));
                    data.Date = month;
                    chart.grouped.push(data);
                })
            });
        }
        return result;
    }

    handleFilterChange = (e) => {
        this.setState({filter: e.target.value});
    };

    getDimensionsFiltered() {
        if (this.state.filter) {
            const filter = this.state.filter.toLowerCase();

            return this.getDataFromChartSelection().filter(item => {
                let res = false;

                for (const value of Object.values(item)) {
                    if (typeof value === 'string' && value.toLowerCase().includes(filter)) {
                        res = true;
                        break;
                    }
                }

                return res;
            });
        } else {
            return this.getDataFromChartSelection();
        }
    };

    getDataFromChartSelection() {
        let result = [];

        let keys = Object.keys(this.state.chartSelections);
        if (keys && keys[0] && !this.state.chartSelections[keys[0]].onSelectAction) {
            let left = this.state.chartSelections[keys[0]].refAreaLeft;
            let right = this.state.chartSelections[keys[0]].refAreaRight;
            if (!left || !right) {
                return this.store.jobResult.filter(item => item['Data Source'] === keys[0]);
            }
            let startDate = moment(left, this.periodFormat);
            let endDate = moment(right, this.periodFormat);
            if (startDate.isAfter(endDate)) {
                startDate = moment(right, this.periodFormat);
                endDate = moment(left, this.periodFormat);
            }
            for (const row of this.store.jobResult) {
                if (row['Data Source'] === keys[0] && this.usingPolicies.includes(row['Policy']) &&
                    this.usingDimensions.includes(row['Dimension']) && COMMON_FUNCTIONS.isDateInRange(row['Date'], startDate, endDate, this.dateFormat)) {
                    result.push(row);
                }
            }
        }
        return result;
    }

    getFieldsByDimensionsColumns(fieldsByDimensionDataFiltered) {
        let result = [];
        if (this.store.jobResult && this.store.jobResult[0]) {
            for (let key of Object.keys(this.store.jobResult[0])) {
                result.push({
                    Header: key,
                    accessor: key,
                    width: COMMON_FUNCTIONS.getColumnWidth(fieldsByDimensionDataFiltered, key, key)
                })
            }
        }
        return result;
    }

    @computed get usingDimensions() {
        const {selectedDimensions} = this.state;
        let dimensionsInUse = [];
        if (selectedDimensions === 'All') {
            dimensionsInUse = this.store.dimensions.toJS();
            dimensionsInUse.splice(0, 1);
        } else {
            dimensionsInUse = [selectedDimensions];
        }
        return dimensionsInUse;
    }

    @computed get usingPolicies() {
        const {selectedPolicy} = this.state;
        let policiesInUse = [];
        if (selectedPolicy === 'All') {
            policiesInUse = this.store.policies.toJS();
            policiesInUse.splice(0, 1);
        } else {
            policiesInUse = [selectedPolicy];
        }
        return policiesInUse;
    }

    @computed get startDateFromPeriod() {
        switch (this.state.selectedPeriod) {
            case PERIODS.LAST_YEAR:
                return moment().subtract('1', 'year');
            case PERIODS.LAST_MONTH:
                return moment().subtract(1, 'months');
            case PERIODS.LAST_WEEK:
                return moment().subtract(1, 'week');

        }
    }

    @computed get periodFormat() {
        return this.state.selectedPeriod === PERIODS.LAST_YEAR ? this.chartYearFormat : this.chartDateFormat;
    }

    getTargetByDimension(dimension) {
        switch (dimension) {
            case 'Completeness':
                return 80;
            case 'Validity':
                return 85;
            case 'Uniqueness':
                return 90;
            case 'Consistency':
                return 95;
            case 'Timeliness':
                return 90;
            default:
                return 90;
        }
    }

    isShowSelectedArea(item) {
        return this.state.chartSelections[item.title] && this.state.chartSelections[item.title].refAreaLeft &&
            this.state.chartSelections[item.title].refAreaRight;
    }

    getLinesFromChartData(data) {
        let result = [];
        if (data && data[0]) {
            let keys = Object.keys(data[0]);
            for (let property of keys) {
                if (property !== 'Date') {
                    result.push(property);
                }
            }
        }
        return result;
    }

    render() {
        const COLORS = ['#002F9C', '#EC87C0', '#8BC24A', '#FFCF47'];
        const DIMENSIONS_COLOR = {
            Completeness: '#aed',
            Validity: '#bcf',
            Uniqueness: '#fca',
            Consistency: '#aaa',
            Timeliness: '#1C99C0'
        };
        const COLORS_CHAT = {
            'Bloomberg Equity': '#009688',
            'Bloomberg Pricing': '#FF7777',
            'Reuters Equity': '#E484D1',
            'Reuters Pricing': '#002F9C'
        };

        const pieData = this.getPIEData();

        const actualVsKPIColumns = this.getActualVsKPIColumns();
        const actualVsKPIData = this.getActualVsKPIData();

        const chartData = this.getChartData();

        const fieldsByDimensionDataFiltered = this.getDimensionsFiltered();
        const fieldsByDimensionsColumns = this.getFieldsByDimensionsColumns(fieldsByDimensionDataFiltered);

        const {selectedDataSource, selectedDimensions, selectedPolicy, selectedPeriod, chartSelections} = this.state;

        return <Preloader state={this.store.state}>
            <div className={styles.dqKpi}>
                <Grid fluid>
                    <Row>
                        <Col lg={12} md={12}>
                            <div style={{marginTop: '15px'}}>
                                <Row>
                                    <Col xs={12} sm={12} md={6} lg={3}>
                                        <FormGroup className={styles.formGroup}
                                                   inline={true}
                                                   label={i18nService.t('dimensions_header_label')}>
                                            <Dropdown placeholder={i18nService.t('dimensions_header')}
                                                      fluid
                                                      selection
                                                      onChange={this.onDimensionsChange.bind(this)}
                                                      value={selectedDimensions}
                                                      options={this.store.dimensions.map(item => {
                                                          return {
                                                              key: item,
                                                              text: item,
                                                              value: item
                                                          };
                                                      })}/>
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={12} md={6} lg={3}>
                                        <FormGroup className={styles.formGroup} inline={true}
                                                   label={i18nService.t('policy_header_label')}>
                                            <Dropdown placeholder={i18nService.t('policy_header')}
                                                      fluid
                                                      selection
                                                      onChange={this.onPolicyChange.bind(this)}
                                                      value={selectedPolicy}
                                                      options={this.store.policies.map(item => {
                                                          return {
                                                              key: item,
                                                              text: item,
                                                              value: item
                                                          };
                                                      })}/>
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={12} md={6} lg={3}>
                                        <FormGroup className={styles.formGroup} inline={true}
                                                   label={i18nService.t('data_source_header_label')}>
                                            <Dropdown placeholder={i18nService.t('data_source_header')}
                                                      fluid
                                                      multiple
                                                      selection
                                                      onChange={this.onDataSourceChange}
                                                      value={selectedDataSource}
                                                      options={this.state.dataSourceOptions}/>
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={12} md={6} lg={3}>
                                        <FormGroup className={styles.formGroup}
                                                   inline={true}
                                                   label={i18nService.t('effective_period_header_label')}>
                                            <Dropdown placeholder={i18nService.t('period_header')}
                                                      fluid
                                                      selection
                                                      onChange={this.onPeriodChange}
                                                      value={selectedPeriod}
                                                      options={this.store.period.map(item => {
                                                          return {
                                                              key: item,
                                                              text: item,
                                                              value: item
                                                          };
                                                      })}/>
                                        </FormGroup>
                                    </Col>
                                </Row>

                                <div className={styles.splitter}></div>

                                <Row>
                                    <Col xs={12} md={12} lg={5}>
                                        <span
                                            className={styles.centred}>{i18nService.t('average_data_quality_for_observation')}</span>
                                        <PieChart width={PIE_CHART_WIDTH} height={PIE_CHART_HEIGHT}
                                                  style={{margin: 'auto', left: '5%'}}>
                                            <Pie data={pieData}
                                                 cx={160}
                                                 cy={180}
                                                 style={{overflow: 'visible'}}
                                                 innerRadius={120}
                                                 outerRadius={140}
                                                 paddingAngle={3}
                                                 dataKey="value"
                                                 label={CustomizedLabel}
                                                 labelLine={false}
                                                 isAnimationActive={false}>
                                                {pieData.map((entry, index) =>
                                                    <Cell key={`cell-${index}`}
                                                          fill={COLORS[index]}/>
                                                )}
                                                <Label className={styles.mainLabel} value={`${pieData[0].value}%`}
                                                       position="center"
                                                       fontSize={'50px'}/>
                                            </Pie>
                                        </PieChart>
                                        <div className={styles.pieChartLegend}>
                                            <span>{i18nService.t('acceptance_level')}</span>
                                            <div className={styles.legend}>
                                                {this.acceptanceLevel.map((entry, index) =>
                                                    <div className={styles.legendItem} key={index}>
                                                        <div className={styles.legendSquare}
                                                             style={{backgroundColor: COLORS[index]}}></div>
                                                        <div>{entry}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Col>
                                    <Col xs={12} md={12} lg={7}>
                                        {i18nService.t('actual_vs_kpi_targets')}
                                        <ReactTable
                                            className="-striped -highlight ds-table"
                                            style={{marginTop: '30px'}}
                                            data={actualVsKPIData}
                                            sortable={false}
                                            multiSort={false}
                                            showPagination={false}
                                            pageSize={actualVsKPIData.length}
                                            columns={actualVsKPIColumns}
                                        />
                                    </Col>
                                </Row>
                                <div className={styles.splitter}></div>
                                <hr></hr>
                                <Row>
                                    {chartData && chartData.length > 0 ? (chartData.map((item, index) =>
                                        <div key={item.title} className={styles.chartContainer}>
                                            <div className={styles.chartTitle}>
                                                <span>{item.title}</span>
                                                <div>
                                                    <Popover
                                                        content={
                                                            <Menu>
                                                                <MenuItem
                                                                    onClick={this.onHideChart.bind(this, item.title)}
                                                                    text={i18nService.t('close')}/>
                                                            </Menu>
                                                        }
                                                        position={Position.BOTTOM_RIGHT}>
                                                        <Icon className='icon-cog'/>
                                                    </Popover>
                                                </div>
                                            </div>
                                            <ResponsiveContainer height={300}>
                                                <LineChart
                                                    height={300}
                                                    data={item.grouped}
                                                    margin={{
                                                        top: 5, right: 30, left: 20, bottom: 5,
                                                    }}
                                                    onMouseDown={e => e && this.setState(state => {
                                                        let selections = state.chartSelections;
                                                        if (!selections[item.title]) {
                                                            for (let key of Object.keys(selections)) {
                                                                delete selections[key];
                                                            }
                                                            selections[item.title] = {};
                                                        }
                                                        selections[item.title].onSelectAction = true;
                                                        selections[item.title].refAreaRight = '';
                                                        selections[item.title].refAreaLeft = e.activeLabel;
                                                        return {chartSelections: selections};
                                                    })}
                                                    onMouseMove={e => {
                                                        if (this.state.chartSelections[item.title] && this.state.chartSelections[item.title].refAreaLeft
                                                            && this.state.chartSelections[item.title].onSelectAction) {
                                                            this.setState(state => {
                                                                let selections = state.chartSelections;
                                                                selections[item.title].refAreaRight = e.activeLabel;
                                                                return {chartSelections: selections};
                                                            })
                                                        }
                                                    }}
                                                    onMouseUp={() => this.setState(state => {
                                                        let selections = state.chartSelections;
                                                        if (selections && selections[item.title]) {
                                                            selections[item.title].onSelectAction = false;
                                                        }
                                                        return {chartSelections: selections};
                                                    })}>
                                                    <CartesianGrid stroke="#eee"/>
                                                    <XAxis tick={{fill: '#999', fontSize: 11}}
                                                           stroke="white"
                                                           tickFormatter={timeStr => {
                                                               if (selectedPeriod === PERIODS.LAST_YEAR) {
                                                                   return timeStr;
                                                               } else {
                                                                   return moment(timeStr, this.dateFormat).format(this.dateFormat);
                                                               }
                                                           }}
                                                           dataKey="Date"/>
                                                    <YAxis tick={{fill: '#999', fontSize: 11}}
                                                           stroke="white"/>
                                                    <Legend/>
                                                    <Tooltip/>
                                                    {
                                                        this.getLinesFromChartData(item.grouped).map(dimension => {
                                                            return <Line key={item.title + ' ' + dimension}
                                                                         dataKey={dimension}
                                                                         dot={{strokeWidth: 3, r: 5}}
                                                                         strokeWidth={3}
                                                                         stroke={DIMENSIONS_COLOR[dimension]}
                                                                         activeDot={{r: 8}}/>
                                                        })
                                                    }
                                                    {
                                                        this.isShowSelectedArea(item) ?
                                                            (<ReferenceArea axisLine={false}
                                                                            x1={chartSelections[item.title].refAreaLeft}
                                                                            x2={chartSelections[item.title].refAreaRight}
                                                                            fill="blue"
                                                                            fillOpacity="0.08"
                                                                            strokeOpacity={0.3}/>
                                                            ) : null

                                                    }
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )) : null}
                                </Row>
                                <div className={styles.splitter}>
                                </div>
                                {
                                    chartSelections && Object.keys(chartSelections).length > 0 && fieldsByDimensionDataFiltered.length > 0 ?
                                        (<Row>
                                            <Col xs={12} md={12} lg={12}>
                                                <div className={styles.headerWithSearch}>
                                                    <span>FIELDS BY DIMENSION</span>
                                                    <input className="bp3-input bp3-large"
                                                           type="text"
                                                           value={this.state.filter}
                                                           placeholder={i18nService.t('begin_typing_to_search')}
                                                           onChange={this.handleFilterChange}/>
                                                </div>
                                                <ReactTable
                                                    className="-striped -highlight ds-table"
                                                    style={{marginTop: '20px'}}
                                                    data={fieldsByDimensionDataFiltered}
                                                    sortable={false}
                                                    multiSort={false}
                                                    PaginationComponent={TablePagination}
                                                    pageSize={20}
                                                    columns={fieldsByDimensionsColumns}
                                                />
                                            </Col>
                                            <div className={styles.splitter}>
                                            </div>
                                        </Row>)
                                        : null
                                }
                            </div>
                        </Col>
                    </Row>
                </Grid>
            </div>
        </Preloader>;
    }
}
