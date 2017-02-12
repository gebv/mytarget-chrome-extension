var Api = {
    listCampaings: [],
    banners: {},
    faststatBanners: {},
    faststatCampaings: {},
    selectedBannerIDs: [],
    loadListCampaings: function (withRelated) {
        return m.request({
            method: "GET",
            url: 'https://target.my.com/api/v1/campaigns.json?status=active&fields=id,name,created,budget_limit',
            withCredentials: true,
        })
            .then(function (res) {
                Api.listCampaings = res;
                if (withRelated) {
                    _(Api.listCampaings).map(function(campaing){
                        return {
                            id: campaing.id,
                            campaingName: campaing.name
                        }
                    }).each(function(campaing){
                        return Api.loadBannersByCampaingID(campaing.id, campaing.campaingName)();
                    })
                }
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
    loadFastStatsByCampaingID: function (campaingID) {
        return function () {
            return m.request({
                method: "GET",
                url: 'https://target.my.com/api/v1/statistics/faststat/campaigns/' + campaingID + '.json',
                withCredentials: true,
            })
                .then(function (res) {
                    Api.faststat[bannerID] = res.campaigns[campaingID];
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

m.route(document.getElementById("content"), "/settings", {
    "/settings": CompactListCampaings,
    "/statistics/hourly": HourlyStat,
    "/statistics/daily": DailyStat,

});

// m.route(document.getElementById("breadcrumb"), "/settings", {
//     "/settings": Breadcrumb,
//     "/statistics/hourly": Breadcrumb,
//     "/statistics/daily": Breadcrumb,
// });

// m.mount(document.getElementById("breadcrumb"), Breadcrumb);