var Api = {
    listCampaings: [], // Список кампаний
    banners: {},
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
                return {};
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
                return {};
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


var currentPageIs = function(url) {

    if (/.*statistics/.test(url)) {
        return "statistics";
    }

    if (/.*settings/.test(url)) {
        return "settings";
    }

    return "unknown";
}

var Breadcrumb = {
    links: [],
    oninit: function(v) {
        if (currentPageIs(location.hash) == "statistics") {
            v.state.links = [
                m("li", m("a[href='#!/settings']", "Настройки")),
                m("li", m("span", "Статистика для " + Api.selectedBannerIDs.length + " баннеров")),
            ];
            return;
        }

        if (currentPageIs(location.hash) == "settings") {
            v.state.links = [
                m("li", m("a[href='#!/settings']", "Настройки")),
            ];
            return;
        }
    },
    view: function(v) {
        return m("ul.uk-breadcrumb", v.state.links);
    }
};

HourlyStat = {
    oninit: function (v) {
        if (Api.selectedBannerIDs.length == 0 ) {
            return;
        }

        Api.loadFastStatsByBannerID(Api.selectedBannerIDs)(v);
        HourlyStat.timerHandlers = setInterval(function(){
            return Api.loadFastStatsByBannerID(Api.selectedBannerIDs)(v);
        }, 1000*30);
    },
    onremove: function(v) {
        return clearInterval(HourlyStat.timerHandlers);
    },
    rates: {},
    view: function (v) {
        var findBanner = function(bannerID) {
            return _.filter(_.flatten(_.values(Api.banners)), {id: ~~bannerID})[0] || {};
        }

        var selectedIDs = Api.selectedBannerIDs;
        if (selectedIDs.length == 0) {
            return m("p", "Не был выбран ни один баннер, либо данные еще не загружены.");
        }

        var data = _.map(selectedIDs, function(bannerID) {
            return {
                stat: Api.faststatBanners[bannerID],
                banner: findBanner(bannerID),
                rate: ~~v.state.rates[bannerID]
            }
        });

        if (data.length == 0) {
            return m("p", "Не был выбран ни один баннер, либо данные еще не загружены.");
        }

        var colRates = _.map(data, function(banner, index){
            return m("li", [
                m("span.uk-text-muted", "#"+(index+1)+" "),
                m("input.uk-form-small[placeholder='Ставка']", {
                    onchange: function(e){
                        v.state.rates[banner.banner.id] = e.target.value;
                    },
                    value: v.state.rates[banner.banner.id] || ""
                })
            ]);
        })

        

        var rows = [];
        var caption = m("caption", "Сводная статистика выбранных банеров - почасовая");
        var thead = m("thead", [
            m("tr", [
                m("th", ""),
                m("th", "Названия"),
                m("th", "Клики"),
                m("th", "Показы"),
                m("th", "CTR"),
                m("th", m("ul.uk-form uk-list", colRates)),
                m("th", ""),
            ])
        ]);
        var tfooter = m("tfoot", [
            m("tr", [
                m("th", ""),
                m("th", "Названия"),
                m("th", "Клики"),
                m("th", "Показы"),
                m("th", "CTR"),
                m("th", m("ul.uk-form uk-list", colRates)),
                m("th", ""),
            ])
        ]);

        for (var i = 59; i >= 0; i--) {
            var colNames = [];
            var colClicks = [];
            var colShows = [];
            var colCRTs = [];
            var colRates = [];
            var colResults = [];

            var tick = new Date(new Date().getTime() - (60-i)*60000);
            var tickMinutes = tick.getMinutes();
            if (tickMinutes < 10) {
                tickMinutes = "0"+tickMinutes;
            }
            var tickFormat = tick.getHours()+":"+tickMinutes;
            var mutedZeroFilter = function(v) {
                if (v == 0) {
                    return m("span.uk-text-muted", v);
                }

                return m("span", v);
            };

            _.each(data, function(banner, index){
                var rate = ~~v.state.rates[banner.banner.id];
                if (!banner.stat) {
                    return;
                }
                var _c = banner.stat.minutely.clicks[i];
                var _s = banner.stat.minutely.shows[i];    

                var ctr = ((_c/_s)*100).toFixed(3);
                if (isNaN(ctr)) {
                    ctr = (0/1).toFixed(3);
                }

                // Result

                colNames.push(m("li", "#"+(index+1) + " " + banner.banner.campaingName));
                colClicks.push(m("li", mutedZeroFilter(_c)));
                colShows.push(m("li", mutedZeroFilter(_s)));
                colCRTs.push(m("li", mutedZeroFilter(ctr)));
                colRates.push(m("li", mutedZeroFilter(_c)));
                colResults.push(m("li", [
                    m("span", mutedZeroFilter((rate*(_c)).toFixed(2))),
                    m("span.uk-text-muted", " / "),
                    m("span", mutedZeroFilter((rate*(_s/1000)).toFixed(2))),
                ]));
            });


            
            rows.push(m("tr", [
                m("td", tickFormat),
                m("td", m("ul.uk-list", colNames)),
                m("td", m("ul.uk-list", colClicks)),
                m("td", m("ul.uk-list", colShows)),
                m("td", m("ul.uk-list", colCRTs)),
                m("td", m("ul.uk-list", colRates)),
                m("td", m("ul.uk-list", colResults)),
            ]))
        }

        var table = m(
            "div.uk-overflow-container",
            m("table.uk-table uk-table-striped uk-table-condensed uk-text-nowrap", [
                    caption,
                    thead,
                    tfooter,
                    m("tbody", rows),
                ])
        );

        return m("div", [
            m("div", m(Breadcrumb)),
            table,
        ]);
    }
};

DailyStat = {
    oninit: function (v) {
        if (Api.selectedBannerIDs.length == 0 ) {
            return;
        }

        Api.loadFastStatsByBannerID(Api.selectedBannerIDs)(v);
        DailyStat.timerHandlers = setInterval(function(){
            return Api.loadFastStatsByBannerID(Api.selectedBannerIDs)(v);
        }, 1000*30);
    },
    onremove: function(v) {
        return clearInterval(DailyStat.timerHandlers);
    },
    rates: {},
    view: function (v) {
        var findBanner = function(bannerID) {
            return _.filter(_.flatten(_.values(Api.banners)), {id: ~~bannerID})[0] || {};
        }

        var selectedIDs = Api.selectedBannerIDs;

        if (selectedIDs.length == 0) {
            return m("p", "Не был выбран ни один баннер, либо данные еще не загружены.");
        }

        var data = _.map(selectedIDs, function(bannerID) {
            return {
                stat: Api.faststatBanners[bannerID],
                banner: findBanner(bannerID),
                rate: ~~v.state.rates[bannerID]
            }
        });

        if (data.length == 0) {
            return m("p", "Не был выбран ни один баннер, либо данные еще не загружены.");
        }

        var colRates = _.map(data, function(banner, index){
            return m("li", [
                m("span.uk-text-muted", "#"+(index+1)+" "),
                m("input.uk-form-small[placeholder='Ставка']", {
                    onchange: function(e){
                        v.state.rates[banner.banner.id] = e.target.value;
                    },
                    value: v.state.rates[banner.banner.id] || ""
                })
            ]);
        })

        

        var rows = [];
        var caption = m("caption", "Сводная статистика выбранных банеров - посуточная");
        var thead = m("thead", [
            m("tr", [
                m("th", ""),
                m("th", "Названия"),
                m("th", "Клики"),
                m("th", "Показы"),
                m("th", "CTR"),
                m("th", m("ul.uk-form uk-list", colRates)),
                m("th", ""),
            ])
        ]);
        var tfooter = m("tfoot", [
            m("tr", [
                m("th", ""),
                m("th", "Названия"),
                m("th", "Клики"),
                m("th", "Показы"),
                m("th", "CTR"),
                m("th", m("ul.uk-form uk-list", colRates)),
                m("th", ""),
            ])
        ]);

        for (var i = 23; i >= 0; i--) {
            var colNames = [];
            var colClicks = [];
            var colShows = [];
            var colCRTs = [];
            var colRates = [];
            var colResults = [];

            var tick = new Date(new Date().getTime() - (23-i)*3600000);
            var tickMinutes = tick.getMinutes();
            if (tickMinutes < 10) {
                tickMinutes = "0"+tickMinutes;
            }
            var tickFormat = tick.getHours()+":"+tickMinutes;
            var mutedZeroFilter = function(v) {
                if (v == 0) {
                    return m("span.uk-text-muted", v);
                }

                return m("span", v);
            };

            _.each(data, function(banner, index){
                var rate = ~~v.state.rates[banner.banner.id];
                if (!banner.stat) {
                    return;
                }
                var _c = banner.stat.hourly.clicks[i];
                var _s = banner.stat.hourly.shows[i];    

                var ctr = ((_c/_s)*100).toFixed(3);
                if (isNaN(ctr)) {
                    ctr = (0/1).toFixed(3);
                }

                // Result

                colNames.push(m("li", "#"+(index+1) + " " + banner.banner.campaingName));
                colClicks.push(m("li", mutedZeroFilter(_c)));
                colShows.push(m("li", mutedZeroFilter(_s)));
                colCRTs.push(m("li", mutedZeroFilter(ctr)));
                colRates.push(m("li", mutedZeroFilter(_c)));
                colResults.push(m("li", [
                    m("span", mutedZeroFilter((rate*(_c)).toFixed(2))),
                    m("span.uk-text-muted", " / "),
                    m("span", mutedZeroFilter((rate*(_s/1000)).toFixed(2))),
                ]));
            });


            
            rows.push(m("tr", [
                m("td", tickFormat),
                m("td", m("ul.uk-list", colNames)),
                m("td", m("ul.uk-list", colClicks)),
                m("td", m("ul.uk-list", colShows)),
                m("td", m("ul.uk-list", colCRTs)),
                m("td", m("ul.uk-list", colRates)),
                m("td", m("ul.uk-list", colResults)),
            ]))
        }

        var table = m(
            "div.uk-overflow-container",
            m("table.uk-table uk-table-striped uk-table-condensed uk-text-nowrap", [
                    caption,
                    thead,
                    tfooter,
                    m("tbody", rows),
                ])
        )

        return m("div", [
            m("div", m(Breadcrumb)),
            table,
        ])
    }
};

var CompactListCampaings = {
    oninit: function(v) {
        return Api.loadListCampaings(true);
    },
    view: function(v) {
        //optgroup
        var opts = _.map(Api.listCampaings, function(c) {
            var gopts = _.map(Api.banners[c.id], function(b) {
                var selected = (_.indexOf(Api.selectedBannerIDs, b.id) != -1);
                return m("option", {value: b.id, selected: selected}, b.title);
            });

            return m("optgroup", {label: c.name}, gopts)
        })

        var controller = m("div.uk-form uk-width-1-2 uk-container-center", m(
                    "select[multiple='multiple'][size=10].uk-form-large uk-width-1-1", 
                    {onchange: function(e) {
                        
                        Api.selectedBannerIDs = _(e.target).
                            filter(function(opt){
                                return opt.selected;
                            }).
                            map(function(opt) {
                                return ~~opt.value;
                            }).
                            value();
                    }},
                    opts
                ));

        return m(
            "div",
            [
                m("div", m(Breadcrumb)),
                controller,
            ]
            )
    }
};

// Поминутная статистика для выбранных кампаний
var MinuteStat = {
    ids: [],
    conf: {},
    findCampaing: function(campaingID) {
        return _.filter(Api.listCampaings, {id: ~~campaingID})[0];
    },
    campaings: function() {
        return Api.faststatCampaings;
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
        if (thie.state.isSingle) {
            return this.getAllBannerIDsByCompaings();
        }

        return this.state.ids;
    },
    // getItemIDs получить позцияю согласно режиму работы
    // Для сингла получаем баннер
    // Для мульти получаем кампанию
    getItemByID: function(id) {
        if (thie.state.isSingle()) {
            var cid = this.state.ids[0];
            var item = _.filter(Api.listCampaings, {id: ~~id})[0] || {};
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

        if (this.mode() == "minutes") {
            var tick = new Date(new Date().getTime() - (60-i)*60000);
            var tickMinutes = tick.getMinutes();
            if (tickMinutes < 10) {
                tickMinutes = "0"+tickMinutes;
            }
            return tick.getHours()+":"+tickMinutes;
        }

        return "n/a";
    },
    mode: function() {
        if (/.*hourly$/.test(location.hash)) {
            return "hourly";
        }

        if (/.*minutes$/.test(location.hash)) {
            return "minutes";
        }

        return "unknown";
    },
    isSingle: function() {
        return v.state.ids ==  1;
    },
    oninit: function(v) {
        v.state.ids = v.attrs.ids.split(",");
        if (v.state.ids.length == 0) {
            return;
        }

        return Api.loadListCampaings(true)
            .then(function(){
                if (!v.state.isSingle()) {
                    Api.loadFastStatsByCampaingID(v.state.ids)(v);
                    v.state.timerHandlers = setInterval(function(){
                        return Api.loadFastStatsByCampaingID(v.state.ids)(v);
                    }, 1000*30);
                } else {
                    Api.loadFastStatsByBannerID(v.state.getAllBannerIDsByCompaings())(v);
                    v.state.timerHandlers = setInterval(function(){
                        return Api.loadFastStatsByBannerID(v.state.getAllBannerIDsByCompaings())(v);
                    }, 1000*30);
                }
            })  
    },
    onremove: function(v) {
        return clearInterval(v.state.timerHandlers);
    },
    view: function(v) {
        var ids = v.state.ids;
        var isWaiting = ids.length == 0;
        if (isWaiting) {
            return m(
                "p", 
                "Не была выбрана ни одина кампания, либо данные еще не загружены."
            );
        }

        var cols = [
                m("th", "Клики"),
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

                if (!item) {
                    return;
                }

                var numClicks = item.hourly.clicks[i];
                var numShows = item.hourly.shows[i];
                var ctr = ((numClicks/numShows)*100).toFixed(3);
                if (isNaN(ctr)) {
                    ctr = (0/1).toFixed(3);
                }
                var rate = ~~v.state.conf[id]["rate"];
                var calcmode = v.state.conf[id]["calcmode"];
                var sum = 0;

                if (rate > 0 && calcmode != "off") {
                    if (calcmode == "clicks") {
                        sum = (rate*numClicks).toFixed(2);
                    }

                    if (calcmode == "shows") {
                        sum = ((rate*numClicks)/1000).toFixed(2);
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

                rowCols.push(
                    m("td", mutedZeroFilter(numClicks)),
                    m("td", mutedZeroFilter(numShows)),
                    m(
                        "td", 
                        mutedZeroFilter(ctr)
                    ),
                     m(
                         "td", 
                         {
                            style: {
                                "border-right": "1px solid #ddd"
                            }
                        },
                        mutedZeroFilter(sum))
                );
            });

            // TODO: итоговая сумма

            rows.push(
                m("tr", rowCols)
            )
        });

        // first row

        // first row
        rows.unshift(
            m("tr", _.map(v.state.getListItemIDs(), function(id, index){
                var item = v.state.getItemByID(id);

                var title = "";
                var id = "";
                var isLoaded = false;
                var modeID = "calculate-mode-for-item-";
                var onChangeMode = function(_id){
                    return function(e) {
                        v.state.conf[_id]["calcmode"] = e.target.value;
                    }
                }
                var onChangeRate = function(_id) {
                    return function(e) {
                        v.state.conf[_id]["rate"] = e.target.value;
                    }
                }

                if (item) {
                    id = item.id;
                    title = item.name;
                    isLoaded = true;
                    modeID += id;
                }

                var subcontrols = isLoaded?
                    [
                        m("li.uk-text-small", id),
                        m("li", title),
                        m("li", m("input.uk-form-small", {
                            onchange: onChangeRate(id),
                            value: v.state.conf[id]["rate"]
                        })),
                        m("li.uk-text-small", [
                            m("div.uk-form-controls", [
                                m(
                                    "label", 
                                    {
                                        for: modeID+"-clicks-radiobutton",
                                    },
                                    "По кликам"
                                ),
                                m(
                                    "input[type=radio]",
                                    {
                                        name: modeID+"-mode",
                                        id: modeID+"-clicks-radiobutton",
                                        value: "clicks",
                                        checked: v.state.conf[id]["calcmode"] == "clicks",
                                        onchange: onChangeMode(id)
                                    }
                                )
                            ]),
                            m("div.uk-form-controls", [
                                m(
                                    "label", 
                                    {
                                        for: modeID+"-shows-radiobutton",
                                    },
                                    "По показам"
                                ),
                                m(
                                    "input[type=radio]",
                                    {
                                        name: modeID+"-mode",
                                        id: modeID+"-shows-radiobutton",
                                        value: "shows",
                                        checked: v.state.conf[id]["calcmode"] == "shows",
                                        onchange: onChangeMode(id)
                                    }
                                )
                            ])
                        ])
                    ]: [
                        m("li", "loading...")
                    ];

                var controls = m("ul.uk-list uk-form", subcontrols)

                if (index == 0) {
                    return [
                        m("th[colspan=1]", ""),
                        m("th[colspan=4]", controls)
                    ]    
                }
                
                return [
                    m("th[colspan=4]", controls)
                ]
            })),
            m("tr", _.map(ids, function(_, index){
                console.log(index);
                if (index == 0) {
                    return [
                        m("th", "#"),
                        m("th", "Клики"),
                        m("th", "Показы"),
                        m("th", "CTR"),
                        m("th", "")
                    ]    
                }
                
                return [
                    m("th", "Клики"),
                    m("th", "Показы"),
                    m("th", "CTR"),
                    m("th", "")
                ]
            })),
            m("tr", _.map(ids, function(id, index){
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
                        m("th", c),
                        m("th", s),
                        m("th", ctr),
                        m("th", sum)
                    ]    
                }
                
                return [
                    m("th", c),
                    m("th", s),
                    m("th", ctr),
                    m("th", sum)
                ]
            }))
        )
        

        var table = m(
            "div.uk-overflow-container",
            m("table.uk-table uk-table-striped uk-table-condensed uk-text-nowrap", [
                m("tbody", rows),
            ]));
        
        return m("div", [
            table,
        ])
    }
};

var SelectCampaing = {
    oninit: function(v) {
        return Api.loadListCampaings(true);
    },
    view: function(v) {
        //optgroup
        var opts = _.map(Api.listCampaings, function(c) {
            console.log(c);
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
                    href: "#!/statistics/campaings/"+Api.selectedCampaingIDs.join(",")+"/minutes"
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
                m("div", m(Breadcrumb)),
                controller
            ]
            )
    }
};

var Stat = {
    view: function(v) {
        return m("span", v.attrs.text);
    }
}

var StatController = {
    ids: [],
    bannerIDs: [],
    isHourly: false,
    isMinutes: false,
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
    oninit: function(v) {
        v.state.ids = v.attrs.ids.split(",");
        v.state.isSingleCompany = v.state.ids.length == 1;
        v.state.isHourly = /.*hourly$/.test(location.hash);
        v.state.isMinutes = /.*minutes$/.test(location.hash);
        var timeout = v.state.isHourly? 1000*60*30: 1000*30;

        console.log("oninit");

        Api.loadListCampaings(true)
            .then(function(){
                if (!v.state.isSingleCompany) {
                    Api.loadFastStatsByCampaingID(v.state.ids)(v);
                    v.state.timerHandlers = setInterval(function(){
                        return Api.loadFastStatsByCampaingID(v.state.ids)(v);
                    }, timeout);
                } else {
                    Api.loadFastStatsByBannerID(v.state.getAllBannerIDsByCompaings())(v);
                    v.state.timerHandlers = setInterval(function(){
                        return Api.loadFastStatsByBannerID(v.state.getAllBannerIDsByCompaings())(v);
                    }, timeout);
                }
            })  
    },
    onremove: function(v) {
        return clearInterval(StatController.timerHandlers);
    },
    view: function(v) {
        return m("p", [
            m(Stat, {
                mode: v.state.isMinutes? "minues": "hourly",

            }),
        ]);
    }
}

m.route(document.getElementById("content"), "/settings2", {
    "/settings": CompactListCampaings,
    "/settings2": SelectCampaing,
    "/statistics/hourly": HourlyStat,
    "/statistics/daily": DailyStat,
    "/statistics/campaings/:ids/minutes": MinuteStat,
    "/statistics/campaings/:ids/hourly": HourlyStat,

});

// m.route(document.getElementById("breadcrumb"), "/settings", {
//     "/settings": Breadcrumb,
//     "/statistics/hourly": Breadcrumb,
//     "/statistics/daily": Breadcrumb,
// });

// m.mount(document.getElementById("breadcrumb"), Breadcrumb);