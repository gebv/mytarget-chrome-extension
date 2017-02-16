var Api = {
    listCampaings: [], // Список кампаний
    banners: {},
    tableSettings: {
        cols: ["clicks", "shows", "CTR", "total"]
    },
    isShowColTable: function(name) {
        return _.indexOf(this.tableSettings.cols, name) != -1;
    },
    numColsTable: function() {
        return this.tableSettings.cols.length;
    },
    faststatBanners: {},
    faststatCampaings: {}, // Суммарная статистика по компаниям
    selectedBannerIDs: [], // устаревшее, удалить после реализации нового механизма выбора компании
    selectedCampaingIDs: [],
    loadListCampaings: function (withRelated) {
        return m.request({
            method: "GET",
            url: 'https://target.my.com/api/v1/campaigns.json?status=active&fields=id,name,created,budget_limit',
            withCredentials: true,
        })
            .then(function (res) {
                Api.listCampaings = res;
                var requests = [];
                if (withRelated) {
                    requests = _(Api.listCampaings).map(function(campaing){
                        return {
                            id: campaing.id,
                            campaingName: campaing.name
                        }
                    }).map(function(campaing){
                        return Api.loadBannersByCampaingID(campaing.id, campaing.campaingName)();
                    })
                }

                return Promise.all(requests)
            })
    },
    loadBannersByCampaingID: function (campaingID, campaingName) {
        return function () {
            return m.request({
                method: "GET",
                url: 'https://target.my.com/api/v1/campaigns/' + campaingID + '/banners.json?status=active&fields=id%2Cstatus%2Cmoderation_status%2Ctitle',
                withCredentials: true,
            })
                .then(function (res) {
                    Api.banners[campaingID] = _(res).
                        filter(
                            { 'status': 'active', 'moderation_status': 'allowed' }
                        ).
                        map(function(item){
                            item.campaingName = campaingName;
                            return item;
                        }).
                        value();
                })
        }
    },
    loadFastStatsByBannerID: function (bannerIDs) {
        return function () {
            if (bannerIDs.length == 0 ) {
                return Promise.all([]);
            }
            return m.request({
                method: "GET",
                url: 'https://target.my.com/api/v1/statistics/faststat/banners/' + bannerIDs.join(";") + '.json',
                withCredentials: true,
            })
                .then(function (res) {
                    Api.faststatBanners = res.banners;
                })
        }
    },
    loadFastStatsByCampaingID: function (campaingIDs) {
        return function () {
            if (campaingIDs.length == 0 ) {
                return Promise.all([]);
            }

            return m.request({
                method: "GET",
                url: 'https://target.my.com/api/v1/statistics/faststat/campaigns/' + campaingIDs.join(";") + '.json',
                withCredentials: true,
            })
                .then(function (res) {
                    Api.faststatCampaings = res.campaigns;
                })
        }
    }
};

var TableSettings = {
    view: function(v) {
        return m(
            "select[multiple='multiple'][size=4]", 
            {onchange: function(e) {
                v.attrs.setOptions(
                    _(e.target).
                        filter(function(opt){
                            return opt.selected;
                        }).
                        map(function(opt) {
                            return opt.value;
                        }).
                        value()
                );
            }},
            [
                m("option[value='clicks']", {
                    selected: _.indexOf(v.attrs.values, 'clicks') != -1,
                }, 'Клики'),
                m(
                    "option[value='shows']",
                    {
                    selected: _.indexOf(v.attrs.values, 'shows') != -1,
                    },
                    'Показы'),
                m(
                    "option[value='CTR']",
                    {
                    selected: _.indexOf(v.attrs.values, 'CTR') != -1,
                    },
                    'CTR'),
                m(
                    "option[value='total']", 
                    {
                    selected: _.indexOf(v.attrs.values, 'total') != -1,
                    },
                    'total')
            ])
    }
}

var RateChanger = {
    view: function(v) {
        return m("div", [
            m("div.uk-form-controls", [
                m(
                    "label", 
                    {
                        for: v.attrs._id+"-rate",
                    },
                    "Ставка"
                ),
                m(
                    "input[type=text]",
                    {
                        id: v.attrs._id+"-rate",
                        value: v.attrs.rate,
                        onchange: v.attrs.onChangeRate
                    }
                )
            ]),
            m("div.uk-form-controls", [
                m(
                    "label", 
                    {
                        for: v.attrs._id+"-clicks-radiobutton",
                    },
                    "По кликам"
                ),
                m(
                    "input[type=radio]",
                    {
                        name: v.attrs._id+"-mode",
                        id: v.attrs._id+"-clicks-radiobutton",
                        value: "clicks",
                        checked: v.attrs.currentMode == "clicks",
                        onchange: v.attrs.onChangeMode
                    }
                )
            ]),
            m("div.uk-form-controls", [
                m(
                    "label", 
                    {
                        for: v.attrs._id+"-shows-radiobutton",
                    },
                    "По показам"
                ),
                m(
                    "input[type=radio]",
                    {
                        name: v.attrs._id+"-mode",
                        id: v.attrs._id+"-shows-radiobutton",
                        value: "shows",
                        checked: v.attrs.currentMode == "shows",
                        onchange: v.attrs.onChangeMode
                    }
                )
            ])
        ])
    }
}


var SelectCampaing = {
    oninit: function(v) {
        return Api.loadListCampaings(true);
    },
    view: function(v) {
        //optgroup
        var opts = _.map(Api.listCampaings, function(c) {
            var selected = (_.indexOf(Api.selectedCampaingIDs, c.id) != -1);
            var blen = Api.banners[c.id]? Api.banners[c.id].length: 0;
            var title = c.name + " ("+blen+")";
            return m(
                "option", 
                {value: c.id, selected: selected}, 
                title
            );
        })

        var clen = Api.listCampaings.length;
        var sclen = Api.selectedCampaingIDs.length;

        var controller = m("div.uk-form uk-width-1-2 uk-container-center", [
            m("p", "Выберете одну или более кампанию"),
            m(
                "select[multiple='multiple'][size=10].uk-form-large uk-width-1-1", 
                {onchange: function(e) {
                    
                    Api.selectedCampaingIDs = _(e.target).
                        filter(function(opt){
                            return opt.selected;
                        }).
                        map(function(opt) {
                            return ~~opt.value;
                        }).
                        value();
                }},
                opts
            ),
            m("div", [
                m(
                    "button.uk-button", 
                    {
                        onclick: function(e) {
                            e.preventDefault();
                            Api.selectedCampaingIDs = _.map(Api.listCampaings, "id");
                            return false;
                        },
                    },
                    "Выбрать все"
                ),
                m(
                    "button.uk-button", 
                    {
                        onclick: function(e) {
                            e.preventDefault();
                            Api.selectedCampaingIDs = [];
                            return false;
                        },
                    },
                    "Сбросить все"
                )
            ]),
            m(
                "a.uk-button uk-button-large uk-width-1-1", 
                {
                    href: "#!/statistics/campaings/"+Api.selectedCampaingIDs.join(",")+"/minutely"
                },
                "Поминутная статистика для " + sclen + " кампаний"
            ),

            m(
                "a.uk-button uk-button-large uk-width-1-1", 
                {
                    href: "#!/statistics/campaings/"+Api.selectedCampaingIDs.join(",")+"/hourly"
                },
                "Почасовая статистика для " + sclen + " кампаний"
            ),

        ]);

        return m(
            "div",
            [
                controller
            ]
            )
    }
};

var StatByMode = {
    ids: [],
    conf: {},
    isReady: false,
    isWaitingMsg: "",
    setCalcModeByID: function(id, v) {
        if (this.conf['for_all'] == undefined) {
            this.conf['for_all'] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.conf[id] == undefined) {
            this.conf[id] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.isSingle()) {
            return this.conf['for_all'].calcmode = v;
        }

        return this.conf[id].calcmode = v;
    },
    setRateByID: function(id, v) {
        if (this.conf['for_all'] == undefined) {
            this.conf['for_all'] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.conf[id] == undefined) {
            this.conf[id] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.isSingle()) {
            return this.conf['for_all'].rate = v;
        }

        return this.conf[id].rate = v;
    },
    getCalcModeByID: function(id) {
        if (this.conf['for_all'] == undefined) {
            this.conf['for_all'] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.conf[id] == undefined) {
            this.conf[id] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.isSingle()) {
            return this.conf['for_all'].calcmode;
        }

        return this.conf[id].calcmode;
    },
    getRateByID: function(id) {
        if (this.conf['for_all'] == undefined) {
            this.conf['for_all'] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.conf[id] == undefined) {
            this.conf[id] = {
                calcmode: "clicks",
                rate: 0
            }
        }

        if (this.isSingle()) {
            return this.conf['for_all'].rate;
        }

        return this.conf[id].rate;
    },
    getBannerIDsByCompanyID: function(cid) {
        return _.map(Api.banners[cid], "id");
    },
    getAllBannerIDsByCompaings: function() {
        return _(this.ids)
                .map(function(id){
                    return this.getBannerIDsByCompanyID(id);
                }.bind(this))
                .flatten()
                .value();
    },

    // getListItemIDs получить массив идентификаторов согласно режиму
    getListItemIDs: function() {
        if (this.isSingle()) {
            return this.getAllBannerIDsByCompaings();
        }

        return this.ids;
    },
    // getItemIDs получить позцияю согласно режиму работы
    // Для сингла получаем баннер
    // Для мульти получаем кампанию
    getItemByID: function(id) {
        if (this.isSingle()) {
            var cid = this.ids[0];
            var item = _.filter(Api.listCampaings, {id: ~~cid})[0] || {};
            item.banner = _.filter(Api.banners[cid], {id: ~~id})[0] || {};
            item.stat = Api.faststatBanners[~~id];
            return item;
        }

        var item = _.filter(Api.listCampaings, {id: ~~id})[0] || {};
        item.stat = Api.faststatCampaings[~~id];

        return item
    },
    formatTickTime: function(i) {
        if (this.mode() == "hourly") {
            var tick = new Date(new Date().getTime() - (23-i)*3600000);
            var tickMinutes = tick.getMinutes();
            if (tickMinutes < 10) {
                tickMinutes = "0"+tickMinutes;
            }
            return tick.getHours()+":"+tickMinutes;
        }

        if (this.mode() == "minutely") {
            var tick = new Date(new Date().getTime() - (60-i)*60000);
            var tickMinutes = tick.getMinutes();
            if (tickMinutes < 10) {
                tickMinutes = "0"+tickMinutes;
            }
            return tick.getHours()+":"+tickMinutes;
        }

        return "n/a";
    },
    iter: function(cb) {
        if (this.mode() == "hourly") {
            for (var i = 23; i >= 0; i--) {
                cb(i);
            }
            return;
        }

        if (this.mode() == "minutely") {
            for (var i = 59; i >= 0; i--) {
                cb(i);
            }

            return;
        }

        return;
    },
    mode: function() {
        if (/.*hourly$/.test(location.hash)) {
            return "hourly";
        }

        if (/.*minutely$/.test(location.hash)) {
            return "minutely";
        }

        return "unknown";
    },
    isSingle: function() {
        return this.ids.length ==  1;
    },
    oninit: function(v) {

        v.state.ids = v.attrs.ids.split(",");
        if (v.state.ids.length == 0) {
            return;
        }

        v.state.isReady = false;
        v.state.isWaitingMsg = "Загрузка списка кампаний и связанных с ними банеров...";

        return Api.loadListCampaings(true)
            .then(function(){
                var calls = [];
                v.state.isWaitingMsg = "Загрузка статистики...";

                if (v.state.isSingle()) {
                    calls.push(Api.loadFastStatsByBannerID(v.state.getAllBannerIDsByCompaings())(v));
                    v.state.timerHandlers = setInterval(function(){
                        return Api.loadFastStatsByBannerID(v.state.getAllBannerIDsByCompaings())(v);
                    }, 1000*30);
                } else {
                    calls.push(Api.loadFastStatsByCampaingID(v.state.ids)(v));

                    v.state.timerHandlers = setInterval(function(){
                        return Api.loadFastStatsByCampaingID(v.state.ids)(v);
                    }, 1000*30);
                }


                return Promise.all(calls).then(function(){
                    v.state.isReady = true;
                    v.state.isWaitingMsg = "Готово";
                });
            })  
    },
    onremove: function(v) {
        return clearInterval(v.state.timerHandlers);
    },
    view: function(v) {
        if (!v.state.isReady) {
            return m(
                "p", 
                v.state.isWaitingMsg
            );
        }

        var ids = v.state.ids;
        var isWaiting = ids.length == 0;
        if (isWaiting) {
            return m(
                "p", 
                "Не была выбрана ни одина кампания, либо данные еще не загружены."
            );
        }

        var cols = [
                Api.isShowColTable("clicks")?
                    m("th", "Клики"):
                    "",
                
                m("th", "Показы"),
                m("th", "CTR"),
                m("th", "Итог")
            ];
        var summ = {};

        // рейт для каждой кампании
        // отображаемые колонки
        var rows = [];
        
        v.state.iter(function(i) {
            var rowCols = [];

            rowCols.push(
                m("td", v.state.formatTickTime(i))
            )

            // значения кампаний

            _.each(v.state.getListItemIDs(), function(id){
                var item = v.state.getItemByID(id);

                if (!item || !item.stat) {
                    rowCols.push(m("td", ""));
                    return;
                }

                var numClicks = item.stat[v.state.mode()].clicks[i];
                var numShows = item.stat[v.state.mode()].shows[i];

                var ctr = ((numClicks/numShows)*100).toFixed(3);
                if (isNaN(ctr)) {
                    ctr = (0/1).toFixed(3);
                }
                var rate = v.state.getRateByID(id);
                var calcmode = v.state.getCalcModeByID(id);
                var sum = 0;

                if (rate > 0 && calcmode != "off") {
                    if (calcmode == "clicks") {
                        sum = (rate*numClicks).toFixed(2);
                    }

                    if (calcmode == "shows") {
                        sum = ((rate*numShows)/1000).toFixed(2);
                    }
                }

                if (summ[id] == undefined) {
                    summ[id] = {
                        clicks: 0,
                        shows: 0,
                        ctr: 0,
                        sum: 0
                    }
                }

                summ[id].clicks += numClicks;
                summ[id].shows += numShows;
                summ[id].ctr += ctr/1;
                summ[id].sum += sum/1;

                if (Api.isShowColTable("clicks")) {
                    rowCols.push(m("td", mutedZeroFilter(numClicks)));
                }

                if (Api.isShowColTable("shows")) {
                    rowCols.push(m("td", mutedZeroFilter(numShows)));
                }

                if (Api.isShowColTable("CTR")) {
                    rowCols.push(m(
                        "td", 
                        mutedZeroFilter(ctr)
                    ));
                }

                if (Api.isShowColTable("total")) {
                    rowCols.push(m(
                         "td", 
                         {
                            style: {
                                // "border-right": "1px solid #ddd"
                            }
                        },
                        mutedZeroFilter(sum)));
                }
            });

            // TODO: итоговая сумма

            rows.push(
                m("tr", rowCols)
            )
        });

        // header helpers

        var onChangeMode = function(_id){
            return function(e) {
                v.state.setCalcModeByID(_id, e.target.value);
            }
        }
        var onChangeRate = function(_id) {
            return function(e) {
                v.state.setRateByID(_id, (e.target.value/1));
            }
        }

        // first row
        rows.unshift(
            m("tr", _.map(v.state.getListItemIDs(), function(id, index){
                var item = v.state.getItemByID(id);

                var title = "";
                var isLoaded = false;
                var modeID = "calculate-mode-for-item-";

                if (item && item.stat) {
                    // _id = item.id;
                    if (v.state.isSingle()) {
                        title = item.banner.title;
                    } else {
                        title = item.name;
                    }
                    
                    isLoaded = true;
                    modeID += id;
                }

                var subcontrols = isLoaded?
                    [
                        m("li.uk-text-small", id),
                        m("li.uk-text-small", title),
                        !v.state.isSingle()?
                            m("li.uk-form.uk-text-small", m(RateChanger, {
                                _id: modeID,
                                key: modeID,
                                currentMode: v.state.getCalcModeByID(id),
                                onChangeRate: onChangeRate(id),
                                onChangeMode: onChangeMode(id)
                            })): 
                            ""
                    ]: [
                        m("li.uk-text-small", id),
                        m("li", "loading...")
                    ];

                var controls = m("ul.uk-list uk-form", subcontrols)

                var firstItem = v.state.getItemByID(_.head(v.state.getListItemIDs()));

                if (index == 0) {
                    return [
                        m(
                            "th[colspan=1]", 
                            v.state.isSingle()?
                                [
                                    m("div.uk-text-small", firstItem.id),
                                    m("div.uk-text-small", firstItem.name),
                                    m("div.uk-form.uk-text-small", m(RateChanger, {
                                        _id: v.state.ids.join(","),
                                        key: v.state.ids.join(","),
                                        currentMode: v.state.getCalcModeByID(),
                                        onChangeRate: onChangeRate(),
                                        onChangeMode: onChangeMode()
                                    }))
                                ]:
                                ""
                        ),
                        m(
                            "th", 
                            {
                                colspan: Api.numColsTable()
                            },
                            controls
                        )
                    ]    
                }
                
                return [
                    m(
                        "th", 
                        {
                            colspan: Api.numColsTable()
                        },
                        controls
                    )
                ]
            })),
            m("tr", _.map(v.state.getListItemIDs(), function(id, index){
                var item = v.state.getItemByID(id);
                var isLoaded = item && item.stat;

                if (!isLoaded) {
                    return [
                        m("th", "..."),
                    ]
                }

                if (index == 0) {
                    return [
                        m("th", "#"),
                        Api.isShowColTable("clicks")?
                            m("th", "Клики"):
                            "",
                        Api.isShowColTable("shows")?
                            m("th", "Показы"):
                            "",
                        Api.isShowColTable("CTR")?
                            m("th", "CTR"):
                            "",
                        Api.isShowColTable("total")?
                            m("th", ""):
                            ""
                    ]    
                }
                
                return [
                    Api.isShowColTable("clicks")?
                        m("th", "Клики"):
                        "",
                    Api.isShowColTable("shows")?
                        m("th", "Показы"):
                        "",
                    Api.isShowColTable("CTR")?
                        m("th", "CTR"):
                        "",
                    Api.isShowColTable("total")?
                        m("th", ""):
                        ""
                ]
            })),
            m("tr", _.map(v.state.getListItemIDs(), function(id, index){
                var item = v.state.getItemByID(id);
                var isLoaded = item && item.stat;

                if (!isLoaded) {
                    return [
                        m("th", "..."),
                    ]
                }

                var info = summ[id];
                var c, s, ctr, sum = 0;

                if (info) {    
                    c = info.clicks;
                    s = info.shows;
                    ctr = info.ctr.toFixed(2);
                    sum = info.sum.toFixed(2);
                }

                if (index == 0) {
                    return [
                        m("th", "Итог"),
                        Api.isShowColTable("clicks")?
                            m("th", c):
                            "",
                        Api.isShowColTable("shows")?
                            m("th", s):
                            "",
                        Api.isShowColTable("CTR")?
                            m("th", ctr):
                            "",
                        Api.isShowColTable("total")?
                            m("th", sum):
                            ""
                    ]    
                }
                
                return [
                    Api.isShowColTable("clicks")?
                        m("th", c):
                        "",
                    Api.isShowColTable("shows")?
                        m("th", s):
                        "",
                    Api.isShowColTable("CTR")?
                        m("th", ctr):
                        "",
                    Api.isShowColTable("total")?
                        m("th", sum):
                        ""
                ]
            }))
        )
        

        var table = m(
            "div.uk-overflow-container",
            m("table.uk-table uk-table-striped uk-table-condensed uk-text-nowrap", [
                m("tbody", rows),
            ]));
        
        return m("div", [
            m(
                "div.uk-form",
                [
                    m("label", "Настройки таблицы"),
                    m(TableSettings, {
                        setOptions: function(cols) {
                            Api.tableSettings.cols = cols;
                        },
                        values: Api.tableSettings.cols
                    })
                ]
            ),
            table,
        ])
    }
};

m.route(document.getElementById("content"), "/settings2", {
    "/settings2": SelectCampaing,
    "/statistics/campaings/:ids/minutely": StatByMode,
    "/statistics/campaings/:ids/hourly": StatByMode,
});

// Helper

var mutedZeroFilter = function(v) {
    if (v == 0) {
        return m("span.uk-text-muted", v);
    }

    return m("span", v);
};